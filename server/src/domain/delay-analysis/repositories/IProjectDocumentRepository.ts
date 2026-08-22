import type { ProjectDocument, ProjectDocumentType, DocumentProcessingStatus } from '../entities/ProjectDocument';

/**
 * Lightweight projection of a document left in 'pending'/'processing' - used by
 * StartupReconciliationService to detect uploads orphaned by a server restart without paying
 * the cost of loading every row's raw content/file bytes up front.
 */
export interface StuckDocumentInfo {
  id: string;
  tenantId: string;
  projectId: string;
  filename: string;
  contentType: string;
  documentType: ProjectDocumentType;
  status: DocumentProcessingStatus;
  processingAttempts: number;
  hasFileData: boolean;
}

export interface IProjectDocumentRepository {
  findById(id: string, tenantId: string): Promise<ProjectDocument | null>;
  findByProjectId(projectId: string, tenantId: string): Promise<ProjectDocument[]>;
  findByProjectIdAndType(projectId: string, tenantId: string, documentType: ProjectDocumentType): Promise<ProjectDocument[]>;
  findByStatus(projectId: string, tenantId: string, status: DocumentProcessingStatus): Promise<ProjectDocument[]>;
  findByContentHash(projectId: string, tenantId: string, contentHash: string): Promise<ProjectDocument | null>;
  /**
   * Returns the subset of the given content hashes that already exist in the project,
   * mapped to the existing document. Used by the client to skip re-uploading duplicates
   * before transferring file bytes.
   */
  findExistingContentHashes(
    projectId: string,
    tenantId: string,
    contentHashes: string[]
  ): Promise<Array<{ contentHash: string; documentId: string; filename: string }>>;
  save(document: ProjectDocument): Promise<void>;
  saveBatch(documents: ProjectDocument[]): Promise<void>;
  update(document: ProjectDocument): Promise<void>;
  delete(id: string, tenantId: string): Promise<void>;
  deleteByProjectId(projectId: string, tenantId: string): Promise<number>;
  countByProjectId(projectId: string, tenantId: string): Promise<number>;
  findByFilenamePattern(projectId: string, tenantId: string, filenamePattern: string): Promise<ProjectDocument[]>;

  /**
   * Persists the original uploaded bytes so processing can be resumed/retried after a server
   * restart without asking the user to re-upload. Should be cleared via `clearFileData` once
   * the document reaches a terminal state.
   */
  setFileData(id: string, tenantId: string, data: Buffer): Promise<void>;
  getFileData(id: string, tenantId: string): Promise<Buffer | null>;
  clearFileData(id: string, tenantId: string): Promise<void>;

  /**
   * All documents anywhere (any project/tenant) sitting in 'pending' or 'processing'. On a
   * single-process app, anything in these states at startup can only be a leftover from a
   * process that died mid-upload - there is no other way to observe them at boot.
   */
  findAllStuckProcessing(): Promise<StuckDocumentInfo[]>;
  incrementProcessingAttempts(id: string, tenantId: string): Promise<number>;
}
