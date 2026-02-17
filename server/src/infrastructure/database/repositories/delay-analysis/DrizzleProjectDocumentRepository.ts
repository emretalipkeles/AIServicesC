import { eq, and, count, ilike } from 'drizzle-orm';
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

  async findByStatus(
    projectId: string,
    tenantId: string,
    status: DocumentProcessingStatus
  ): Promise<ProjectDocument[]> {
    const result = await db
      .select()
      .from(projectDocuments)
      .where(and(
        eq(projectDocuments.projectId, projectId),
        eq(projectDocuments.tenantId, tenantId),
        eq(projectDocuments.status, status)
      ));

    return result.map(row => this.mapRowToEntity(row));
  }

  async findByContentHash(
    projectId: string,
    tenantId: string,
    contentHash: string
  ): Promise<ProjectDocument | null> {
    const result = await db
      .select()
      .from(projectDocuments)
      .where(and(
        eq(projectDocuments.projectId, projectId),
        eq(projectDocuments.tenantId, tenantId),
        eq(projectDocuments.contentHash, contentHash)
      ))
      .limit(1);

    if (result.length === 0) return null;
    return this.mapRowToEntity(result[0]);
  }

  async save(document: ProjectDocument): Promise<void> {
    await db.insert(projectDocuments).values({
      id: document.id,
      projectId: document.projectId,
      tenantId: document.tenantId,
      filename: document.filename,
      contentType: document.contentType,
      documentType: document.documentType,
      contentHash: document.contentHash,
      rawContent: document.rawContent,
      reportDate: document.reportDate,
      status: document.status,
      errorMessage: document.errorMessage,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    });
  }

  async saveBatch(documents: ProjectDocument[]): Promise<void> {
    if (documents.length === 0) return;
    
    await db.insert(projectDocuments).values(
      documents.map(doc => ({
        id: doc.id,
        projectId: doc.projectId,
        tenantId: doc.tenantId,
        filename: doc.filename,
        contentType: doc.contentType,
        documentType: doc.documentType,
        contentHash: doc.contentHash,
        rawContent: doc.rawContent,
        reportDate: doc.reportDate,
        status: doc.status,
        errorMessage: doc.errorMessage,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }))
    );
  }

  async update(document: ProjectDocument): Promise<void> {
    await db
      .update(projectDocuments)
      .set({
        contentHash: document.contentHash,
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

  async deleteByProjectId(projectId: string, tenantId: string): Promise<number> {
    const docsToDelete = await db
      .select({ count: count() })
      .from(projectDocuments)
      .where(and(
        eq(projectDocuments.projectId, projectId),
        eq(projectDocuments.tenantId, tenantId)
      ));

    const deletedCount = docsToDelete[0]?.count ?? 0;

    await db
      .delete(projectDocuments)
      .where(and(
        eq(projectDocuments.projectId, projectId),
        eq(projectDocuments.tenantId, tenantId)
      ));

    return deletedCount;
  }

  async countByProjectId(projectId: string, tenantId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(projectDocuments)
      .where(and(
        eq(projectDocuments.projectId, projectId),
        eq(projectDocuments.tenantId, tenantId)
      ));

    return result[0]?.count ?? 0;
  }

  async findByFilenamePattern(
    projectId: string,
    tenantId: string,
    filenamePattern: string
  ): Promise<ProjectDocument[]> {
    const result = await db
      .select()
      .from(projectDocuments)
      .where(and(
        eq(projectDocuments.projectId, projectId),
        eq(projectDocuments.tenantId, tenantId),
        ilike(projectDocuments.filename, '%' + filenamePattern + '%')
      ));

    return result.map(row => this.mapRowToEntity(row));
  }

  private mapRowToEntity(row: typeof projectDocuments.$inferSelect): ProjectDocument {
    return new ProjectDocument({
      id: row.id,
      projectId: row.projectId,
      tenantId: row.tenantId,
      filename: row.filename,
      contentType: row.contentType,
      documentType: row.documentType as ProjectDocumentType,
      contentHash: row.contentHash,
      rawContent: row.rawContent,
      reportDate: row.reportDate,
      status: row.status as DocumentProcessingStatus,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    });
  }
}
