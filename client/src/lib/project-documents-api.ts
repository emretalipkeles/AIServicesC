import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ProjectDocumentDto {
  id: string;
  projectId: string;
  filename: string;
  contentType: string;
  documentType: string;
  status: string;
  reportDate: string | null;
  errorMessage: string | null;
  hasContent: boolean;
  createdAt: string;
  updatedAt: string;
  structuredExtractionStatus: string | null;
  structuredExtractionSummary: string | null;
}

export interface UploadResult {
  uploaded: Array<{
    id: string;
    filename: string;
    status: string;
  }>;
  failed: Array<{
    filename: string;
    error: string;
  }>;
  skipped: Array<{
    filename: string;
    reason: string;
    existingDocumentId: string;
  }>;
}

export interface BatchUploadProgress {
  currentBatch: number;
  totalBatches: number;
  uploadedCount: number;
  totalFiles: number;
  failedFiles: Array<{ filename: string; error: string }>;
}

export interface BatchUploadResult {
  uploaded: Array<{
    id: string;
    filename: string;
    status: string;
  }>;
  failed: Array<{
    filename: string;
    error: string;
  }>;
  skipped: Array<{
    filename: string;
    reason: string;
    existingDocumentId: string;
  }>;
  totalBatches: number;
}

export type ProjectDocumentType = 'idr' | 'ncr' | 'field_memo' | 'cpm_schedule' | 'contract_plan' | 'dsc_claim' | 'pod' | 'daily_report' | 'other';

const BATCH_SIZE = 25;

async function fetchDocuments(projectId: string): Promise<ProjectDocumentDto[]> {
  const response = await fetch(`/api/delay-analysis/projects/${projectId}/documents`);
  if (!response.ok) {
    throw new Error("Failed to fetch documents");
  }
  return response.json();
}

async function uploadDocumentsBatch(
  projectId: string, 
  files: File[], 
  documentType: ProjectDocumentType
): Promise<UploadResult> {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));
  formData.append('documentType', documentType);

  const response = await fetch(`/api/delay-analysis/projects/${projectId}/documents`, {
    method: "POST",
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error("Failed to upload documents");
  }
  return response.json();
}

const HASH_CHECK_CHUNK_SIZE = 500;
const HASH_CONCURRENCY = 1;

async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Asks the server which of these files were already uploaded (by content hash) so we can
 * skip re-sending their bytes. Re-uploading a large folder otherwise re-transfers every
 * duplicate, which is what makes "just upload everything again" impractical.
 * Returns null when the check is unavailable, so the caller falls back to a plain upload
 * (the server still de-duplicates on its side).
 */
async function findAlreadyUploaded(
  projectId: string,
  files: File[]
): Promise<Map<File, { documentId: string; filename: string }> | null> {
  try {
    // Hash a few files at a time: hashing all of them in parallel would pull every file's
    // bytes into browser memory at once, which is fatal for folders of several hundred PDFs.
    const hashes: string[] = [];
    for (let i = 0; i < files.length; i += HASH_CONCURRENCY) {
      const slice = files.slice(i, i + HASH_CONCURRENCY);
      hashes.push(...await Promise.all(slice.map(computeFileHash)));
    }

    const existingByHash = new Map<string, { documentId: string; filename: string }>();

    for (let i = 0; i < hashes.length; i += HASH_CHECK_CHUNK_SIZE) {
      const chunk = hashes.slice(i, i + HASH_CHECK_CHUNK_SIZE);
      const response = await fetch(
        `/api/delay-analysis/projects/${projectId}/documents/check-duplicates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hashes: chunk }),
        }
      );
      if (!response.ok) return null;
      const data = await response.json() as {
        existing: Array<{ contentHash: string; documentId: string; filename: string }>;
      };
      for (const row of data.existing) {
        existingByHash.set(row.contentHash, { documentId: row.documentId, filename: row.filename });
      }
    }

    const result = new Map<File, { documentId: string; filename: string }>();
    files.forEach((file, index) => {
      const existing = existingByHash.get(hashes[index]);
      if (existing) result.set(file, existing);
    });
    return result;
  } catch {
    return null;
  }
}

async function uploadBatchWithRetry(
  projectId: string,
  batch: File[],
  documentType: ProjectDocumentType
): Promise<UploadResult> {
  try {
    return await uploadDocumentsBatch(projectId, batch, documentType);
  } catch (error) {
    // A single dropped connection (server restart, flaky network) should not doom 25 files
    // in the middle of an hours-long bulk upload — give the batch one more chance.
    await new Promise(resolve => setTimeout(resolve, 2000));
    return uploadDocumentsBatch(projectId, batch, documentType);
  }
}

export async function uploadDocumentsInBatches(
  projectId: string,
  files: File[],
  documentType: ProjectDocumentType,
  onProgress?: (progress: BatchUploadProgress) => void
): Promise<BatchUploadResult> {
  const allUploaded: BatchUploadResult['uploaded'] = [];
  const allFailed: BatchUploadResult['failed'] = [];
  const allSkipped: BatchUploadResult['skipped'] = [];

  const alreadyUploaded = await findAlreadyUploaded(projectId, files);
  let filesToUpload = files;
  if (alreadyUploaded && alreadyUploaded.size > 0) {
    filesToUpload = files.filter(file => !alreadyUploaded.has(file));
    for (const file of files) {
      const existing = alreadyUploaded.get(file);
      if (existing) {
        allSkipped.push({
          filename: file.name,
          reason: 'This document was already uploaded',
          existingDocumentId: existing.documentId,
        });
      }
    }
  }

  const batches: File[][] = [];
  for (let i = 0; i < filesToUpload.length; i += BATCH_SIZE) {
    batches.push(filesToUpload.slice(i, i + BATCH_SIZE));
  }

  onProgress?.({
    currentBatch: 0,
    totalBatches: batches.length,
    uploadedCount: 0,
    totalFiles: filesToUpload.length,
    failedFiles: [],
  });

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    
    onProgress?.({
      currentBatch: i + 1,
      totalBatches: batches.length,
      uploadedCount: allUploaded.length,
      totalFiles: filesToUpload.length,
      failedFiles: [...allFailed],
    });

    try {
      const result = await uploadBatchWithRetry(projectId, batch, documentType);
      allUploaded.push(...result.uploaded);
      allFailed.push(...result.failed);
      allSkipped.push(...(result.skipped ?? []));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      batch.forEach(file => {
        allFailed.push({ filename: file.name, error: errorMessage });
      });
    }

    onProgress?.({
      currentBatch: i + 1,
      totalBatches: batches.length,
      uploadedCount: allUploaded.length,
      totalFiles: filesToUpload.length,
      failedFiles: [...allFailed],
    });
  }

  return {
    uploaded: allUploaded,
    failed: allFailed,
    skipped: allSkipped,
    totalBatches: batches.length,
  };
}

async function deleteDocument(projectId: string, documentId: string): Promise<void> {
  const response = await fetch(`/api/delay-analysis/projects/${projectId}/documents/${documentId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete document");
  }
}

export interface DeleteAllDocumentsResult {
  success: boolean;
  deletedDocumentsCount: number;
  deletedEventsCount: number;
}

async function deleteAllDocuments(projectId: string): Promise<DeleteAllDocumentsResult> {
  const response = await fetch(`/api/delay-analysis/projects/${projectId}/documents`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete all documents");
  }
  return response.json();
}

export function useProjectDocuments(projectId: string) {
  return useQuery({
    queryKey: ["project-documents", projectId],
    queryFn: () => fetchDocuments(projectId),
    enabled: !!projectId,
    refetchInterval: 5000,
  });
}

export function useUploadDocuments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, files, documentType }: { 
      projectId: string; 
      files: File[]; 
      documentType: ProjectDocumentType;
    }) => uploadDocumentsBatch(projectId, files, documentType),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["project-documents", projectId] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, documentId }: { projectId: string; documentId: string }) => 
      deleteDocument(projectId, documentId),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["project-documents", projectId] });
    },
  });
}

export function useDeleteAllDocuments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId }: { projectId: string }) => 
      deleteAllDocuments(projectId),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["project-documents", projectId] });
      queryClient.invalidateQueries({ queryKey: ["delay-events", projectId] });
    },
  });
}
