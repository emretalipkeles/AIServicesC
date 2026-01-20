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

export type ProjectDocumentType = 'idr' | 'ncr' | 'field_memo' | 'cpm_schedule' | 'contract_plan' | 'dsc_claim' | 'other';

async function fetchDocuments(projectId: string): Promise<ProjectDocumentDto[]> {
  const response = await fetch(`/api/delay-analysis/projects/${projectId}/documents`);
  if (!response.ok) {
    throw new Error("Failed to fetch documents");
  }
  return response.json();
}

async function uploadDocuments(
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
    }) => uploadDocuments(projectId, files, documentType),
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
