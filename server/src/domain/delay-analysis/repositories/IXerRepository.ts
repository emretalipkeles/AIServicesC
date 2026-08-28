import type { XerRun } from "../entities/XerRun";
import type { XerUpload } from "../entities/XerUpload";

export interface XerRunSummary {
  id: string;
  uploadId: string;
  projectId: string;
  tenantId: string;
  outcome: XerRun["outcome"];
  detectedVersion: string | null;
  diffReport: XerRun["diffReport"];
  errorMessage: string | null;
  originalSha256: string | null;
  outputSha256: string | null;
  structuralSummary: XerRun["structuralSummary"];
  createdAt: Date;
  hasOutput: boolean;
}

export interface XerUploadSummary {
  id: string;
  projectId: string;
  tenantId: string;
  filename: string;
  contentType: string;
  detectedVersion: string | null;
  parseError: string | null;
  createdAt: Date;
  runs: XerRunSummary[];
}

export interface IXerRepository {
  saveUpload(upload: XerUpload): Promise<void>;
  findUpload(id: string, projectId: string, tenantId: string): Promise<XerUpload | null>;
  listUploads(projectId: string, tenantId: string): Promise<XerUploadSummary[]>;
  saveRun(run: XerRun): Promise<void>;
  findRun(runId: string, uploadId: string, projectId: string, tenantId: string): Promise<XerRun | null>;
}