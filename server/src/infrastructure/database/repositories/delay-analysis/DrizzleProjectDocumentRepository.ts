import { eq, and } from 'drizzle-orm';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import { ProjectDocument, type ProjectDocumentType, type DocumentProcessingStatus } from '../../../../domain/delay-analysis/entities/ProjectDocument';
import { projectDocuments } from '@shared/schema';
import { db } from '../../../database';

export class DrizzleProjectDocumentRepository implements IProjectDocumentRepository {
  async findById(id: string, tenantId: string): Promise<ProjectDocument | null> {
    const result = await db
      .select()
      .from(projectDocuments)
      .where(and(eq(projectDocuments.id, id), eq(projectDocuments.tenantId, tenantId)))
      .limit(1);

    if (result.length === 0) return null;

    return this.mapRowToEntity(result[0]);
  }

  async findByProjectId(projectId: string, tenantId: string): Promise<ProjectDocument[]> {
    const result = await db
      .select()
      .from(projectDocuments)
      .where(and(
        eq(projectDocuments.projectId, projectId), 
        eq(projectDocuments.tenantId, tenantId)
      ));

    return result.map(row => this.mapRowToEntity(row));
  }

  async findByProjectIdAndType(
    projectId: string, 
    tenantId: string, 
    documentType: ProjectDocumentType
  ): Promise<ProjectDocument[]> {
    const result = await db
      .select()
      .from(projectDocuments)
      .where(and(
        eq(projectDocuments.projectId, projectId),
        eq(projectDocuments.tenantId, tenantId),
        eq(projectDocuments.documentType, documentType)
      ));

    return result.map(row => this.mapRowToEntity(row));
  }

  async save(document: ProjectDocument): Promise<void> {
    await db.insert(projectDocuments).values({
      id: document.id,
      projectId: document.projectId,
      tenantId: document.tenantId,
      filename: document.filename,
      contentType: document.contentType,
      documentType: document.documentType,
      rawContent: document.rawContent,
      reportDate: document.reportDate,
      status: document.status,
      errorMessage: document.errorMessage,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    });
  }

  async update(document: ProjectDocument): Promise<void> {
    await db
      .update(projectDocuments)
      .set({
        rawContent: document.rawContent,
        reportDate: document.reportDate,
        status: document.status,
        errorMessage: document.errorMessage,
        updatedAt: document.updatedAt,
      })
      .where(and(
        eq(projectDocuments.id, document.id), 
        eq(projectDocuments.tenantId, document.tenantId)
      ));
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await db
      .delete(projectDocuments)
      .where(and(eq(projectDocuments.id, id), eq(projectDocuments.tenantId, tenantId)));
  }

  private mapRowToEntity(row: typeof projectDocuments.$inferSelect): ProjectDocument {
    return new ProjectDocument({
      id: row.id,
      projectId: row.projectId,
      tenantId: row.tenantId,
      filename: row.filename,
      contentType: row.contentType,
      documentType: row.documentType as ProjectDocumentType,
      rawContent: row.rawContent,
      reportDate: row.reportDate,
      status: row.status as DocumentProcessingStatus,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    });
  }
}
