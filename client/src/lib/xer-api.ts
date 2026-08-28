import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface XerDifference {
  category: string;
  table?: string;
  identityKey?: string;
  field?: string;
  original?: unknown;
  generated?: unknown;
  message: string;
}

export interface XerDiffReport {
  byteIdentical: boolean;
  outcome: "clean" | "differences" | "incomplete";
  originalSha256: string;
  generatedSha256: string;
  differences: XerDifference[];
}

export interface XerStructuralSide {
  byteCount: number;
  tableCount: number | null;
  rowCountsByTable: Record<string, number> | null;
}

export interface XerStructuralSummary {
  original: XerStructuralSide;
  output: XerStructuralSide | null;
}

export type XerRunIntegrityStatus = "verified" | "incomplete_record" | "hash_mismatch" | "not_applicable";

export interface XerRun {
  id: string;
  uploadId: string;
  projectId: string;
  outcome: "clean" | "differences" | "incomplete" | "stopped";
  /**
   * Whether a "clean" outcome is actually backed by a complete, matching set
   * of verification evidence (output file + both hashes). Only "verified"
   * may ever be shown as a pass — `outcome === "clean"` alone is not enough.
   */
  integrityStatus: XerRunIntegrityStatus;
  detectedVersion: string | null;
  diffReport: XerDiffReport | null;
  errorMessage: string | null;
  originalSha256: string | null;
  outputSha256: string | null;
  structuralSummary: XerStructuralSummary | null;
  createdAt: string;
  hasOutput: boolean;
}

export interface XerUpload {
  id: string;
  projectId: string;
  filename: string;
  contentType: string;
  detectedVersion: string | null;
  parseError: string | null;
  createdAt: string;
  runs: XerRun[];
}

async function errorFrom(response: Response): Promise<Error> {
  const body = await response.json().catch(() => ({}));
  return new Error(body.error ?? "XER request failed");
}

export function useXerUploads(projectId: string, enabled = true) {
  return useQuery<XerUpload[]>({
    queryKey: ["xer-uploads", projectId],
    queryFn: async () => {
      const response = await fetch(`/api/delay-analysis/projects/${encodeURIComponent(projectId)}/xer`);
      if (!response.ok) throw await errorFrom(response);
      return response.json();
    },
    enabled: Boolean(projectId) && enabled,
  });
}

export function useUploadXer(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<XerUpload> => {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/delay-analysis/projects/${encodeURIComponent(projectId)}/xer`, {
        method: "POST",
        body: form,
      });
      if (!response.ok) throw await errorFrom(response);
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["xer-uploads", projectId] }),
  });
}

export function useRunXerNullTest(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (uploadId: string): Promise<XerRun> => {
      const response = await fetch(
        `/api/delay-analysis/projects/${encodeURIComponent(projectId)}/xer/${encodeURIComponent(uploadId)}/runs`,
        { method: "POST" },
      );
      if (!response.ok) throw await errorFrom(response);
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["xer-uploads", projectId] }),
  });
}

export function xerDownloadUrl(projectId: string, uploadId: string, runId: string): string {
  return `/api/delay-analysis/projects/${encodeURIComponent(projectId)}/xer/${encodeURIComponent(uploadId)}/runs/${encodeURIComponent(runId)}/download`;
}

export function xerVerificationRecordUrl(projectId: string, uploadId: string, runId: string): string {
  return `/api/delay-analysis/projects/${encodeURIComponent(projectId)}/xer/${encodeURIComponent(uploadId)}/runs/${encodeURIComponent(runId)}/verification`;
}
