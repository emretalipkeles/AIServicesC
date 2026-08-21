import type { ProjectDocument, ProjectDocumentType, DocumentProcessingStatus } from '../entities/ProjectDocument';

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
}
