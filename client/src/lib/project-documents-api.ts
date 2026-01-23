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
  totalBatches: number;
}

export type ProjectDocumentType = 'idr' | 'ncr' | 'field_memo' | 'cpm_schedule' | 'contract_plan' | 'dsc_claim' | 'other';

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

export async function uploadDocumentsInBatches(
  projectId: string,
  files: File[],
  documentType: ProjectDocumentType,
  onProgress?: (progress: BatchUploadProgress) => void
): Promise<BatchUploadResult> {
  const batches: File[][] = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    batches.push(files.slice(i, i + BATCH_SIZE));
  }

  const allUploaded: BatchUploadResult['uploaded'] = [];
  const allFailed: BatchUploadResult['failed'] = [];

  onProgress?.({
    currentBatch: 0,
    totalBatches: batches.length,
    uploadedCount: 0,
    totalFiles: files.length,
    failedFiles: [],
  });

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    
    onProgress?.({
      currentBatch: i + 1,
      totalBatches: batches.length,
      uploadedCount: allUploaded.length,
      totalFiles: files.length,
      failedFiles: [...allFailed],
    });

    try {
      const result = await uploadDocumentsBatch(projectId, batch, documentType);
      allUploaded.push(...result.uploaded);
      allFailed.push(...result.failed);
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
      totalFiles: files.length,
      failedFiles: [...allFailed],
    });
  }

  return {
    uploaded: allUploaded,
    failed: allFailed,
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
