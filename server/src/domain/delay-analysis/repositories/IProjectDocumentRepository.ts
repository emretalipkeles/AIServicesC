import type { ProjectDocument, ProjectDocumentType, DocumentProcessingStatus } from '../entities/ProjectDocument';

export interface IProjectDocumentRepository {
  findById(id: string, tenantId: string): Promise<ProjectDocument | null>;
  findByProjectId(projectId: string, tenantId: string): Promise<ProjectDocument[]>;
  findByProjectIdAndType(projectId: string, tenantId: string, documentType: ProjectDocumentType): Promise<ProjectDocument[]>;
  findByStatus(projectId: string, tenantId: string, status: DocumentProcessingStatus): Promise<ProjectDocument[]>;
  save(document: ProjectDocument): Promise<void>;
  saveBatch(documents: ProjectDocument[]): Promise<void>;
  update(document: ProjectDocument): Promise<void>;
  delete(id: string, tenantId: string): Promise<void>;
  deleteByProjectId(projectId: string, tenantId: string): Promise<number>;
  countByProjectId(projectId: string, tenantId: string): Promise<number>;
}
