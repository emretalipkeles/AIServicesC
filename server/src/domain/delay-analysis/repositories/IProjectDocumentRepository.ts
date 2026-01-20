import type { ProjectDocument, ProjectDocumentType } from '../entities/ProjectDocument';

export interface IProjectDocumentRepository {
  findById(id: string, tenantId: string): Promise<ProjectDocument | null>;
  findByProjectId(projectId: string, tenantId: string): Promise<ProjectDocument[]>;
  findByProjectIdAndType(projectId: string, tenantId: string, documentType: ProjectDocumentType): Promise<ProjectDocument[]>;
  save(document: ProjectDocument): Promise<void>;
  update(document: ProjectDocument): Promise<void>;
  delete(id: string, tenantId: string): Promise<void>;
}
