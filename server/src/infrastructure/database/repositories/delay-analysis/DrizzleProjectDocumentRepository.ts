import { eq, and, count, ilike, inArray, or, sql } from 'drizzle-orm';
import type { IProjectDocumentRepository, StuckDocumentInfo } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import { ProjectDocument, type ProjectDocumentType, type DocumentProcessingStatus } from '../../../../domain/delay-analysis/entities/ProjectDocument';
import { projectDocuments } from '@shared/schema';
import { db } from '../../../database';

// Columns for normal reads. Deliberately excludes `fileData` (raw upload bytes, potentially
// tens of MB) - it is only ever needed by the retry path in setFileData/getFileData/
// clearFileData, and pulling it into every list/lookup query would be a serious cost blowup
// for a 900+ document project.
const DOCUMENT_COLUMNS = {
  id: projectDocuments.id,
  projectId: projectDocuments.projectId,
  tenantId: projectDocuments.tenantId,
  filename: projectDocuments.filename,
  contentType: projectDocuments.contentType,
  documentType: projectDocuments.documentType,
  contentHash: projectDocuments.contentHash,
  rawContent: projectDocuments.rawContent,
  reportDate: projectDocuments.reportDate,
  status: projectDocuments.status,
  errorMessage: projectDocuments.errorMessage,
  structuredExtractionStatus: projectDocuments.structuredExtractionStatus,
  structuredExtractionError: projectDocuments.structuredExtractionError,
  structuredExtractionSummary: projectDocuments.structuredExtractionSummary,
  createdAt: projectDocuments.createdAt,
  updatedAt: projectDocuments.updatedAt,
};

type DocumentRow = {
  id: string;
  projectId: string;
  tenantId: string;
  filename: string;
  contentType: string;
  documentType: string;
  contentHash: string | null;
  rawContent: string | null;
  reportDate: Date | null;
  status: string;
  errorMessage: string | null;
  structuredExtractionStatus: string | null;
  structuredExtractionError: string | null;
  structuredExtractionSummary: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export class DrizzleProjectDocumentRepository implements IProjectDocumentRepository {
  async findById(id: string, tenantId: string): Promise<ProjectDocument | null> {
    const result = await db
      .select(DOCUMENT_COLUMNS)
      .from(projectDocuments)
      .where(and(eq(projectDocuments.id, id), eq(projectDocuments.tenantId, tenantId)))
      .limit(1);

    if (result.length === 0) return null;

    return this.mapRowToEntity(result[0]);
  }

  async findByProjectId(projectId: string, tenantId: string): Promise<ProjectDocument[]> {
    const result = await db
      .select(DOCUMENT_COLUMNS)
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
      .select(DOCUMENT_COLUMNS)
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
      .select(DOCUMENT_COLUMNS)
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
      .select(DOCUMENT_COLUMNS)
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

  async findExistingContentHashes(
    projectId: string,
    tenantId: string,
    contentHashes: string[]
  ): Promise<Array<{ contentHash: string; documentId: string; filename: string }>> {
    if (contentHashes.length === 0) return [];

    const rows = await db
      .select({
        contentHash: projectDocuments.contentHash,
        documentId: projectDocuments.id,
        filename: projectDocuments.filename,
      })
      .from(projectDocuments)
      .where(and(
        eq(projectDocuments.projectId, projectId),
        eq(projectDocuments.tenantId, tenantId),
        inArray(projectDocuments.contentHash, contentHashes)
      ));

    return rows
      .filter((row): row is { contentHash: string; documentId: string; filename: string } =>
        row.contentHash !== null
      );
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
      structuredExtractionStatus: document.structuredExtractionStatus,
      structuredExtractionError: document.structuredExtractionError,
      structuredExtractionSummary: document.structuredExtractionSummary,
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
        structuredExtractionStatus: doc.structuredExtractionStatus,
        structuredExtractionError: doc.structuredExtractionError,
        structuredExtractionSummary: doc.structuredExtractionSummary,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }))
    );
  }

  async update(document: ProjectDocument): Promise<void> {
    // Clearing retained upload bytes happens in the same statement as the terminal status
    // write, not a separate call after it. A crash between "status = completed" and a
    // follow-up clearFileData would otherwise retain bytes forever, since completed/failed
    // rows are excluded from startup reconciliation's stuck-document scan.
    const isTerminal = document.status === 'completed' || document.status === 'failed';

    await db
      .update(projectDocuments)
      .set({
        contentHash: document.contentHash,
        rawContent: document.rawContent,
        reportDate: document.reportDate,
        status: document.status,
        errorMessage: document.errorMessage,
        structuredExtractionStatus: document.structuredExtractionStatus,
        structuredExtractionError: document.structuredExtractionError,
        structuredExtractionSummary: document.structuredExtractionSummary,
        updatedAt: document.updatedAt,
        ...(isTerminal ? { fileData: null } : {}),
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
      .select(DOCUMENT_COLUMNS)
      .from(projectDocuments)
      .where(and(
        eq(projectDocuments.projectId, projectId),
        eq(projectDocuments.tenantId, tenantId),
        ilike(projectDocuments.filename, '%' + filenamePattern + '%')
      ));

    return result.map(row => this.mapRowToEntity(row));
  }

  async setFileData(id: string, tenantId: string, data: Buffer): Promise<void> {
    await db
      .update(projectDocuments)
      .set({ fileData: data })
      .where(and(eq(projectDocuments.id, id), eq(projectDocuments.tenantId, tenantId)));
  }

  async getFileData(id: string, tenantId: string): Promise<Buffer | null> {
    const result = await db
      .select({ fileData: projectDocuments.fileData })
      .from(projectDocuments)
      .where(and(eq(projectDocuments.id, id), eq(projectDocuments.tenantId, tenantId)))
      .limit(1);

    if (result.length === 0 || !result[0].fileData) return null;
    return result[0].fileData;
  }

  async clearFileData(id: string, tenantId: string): Promise<void> {
    await db
      .update(projectDocuments)
      .set({ fileData: null })
      .where(and(eq(projectDocuments.id, id), eq(projectDocuments.tenantId, tenantId)));
  }

  async findAllStuckProcessing(): Promise<StuckDocumentInfo[]> {
    const result = await db
      .select({
        id: projectDocuments.id,
        tenantId: projectDocuments.tenantId,
        projectId: projectDocuments.projectId,
        filename: projectDocuments.filename,
        contentType: projectDocuments.contentType,
        documentType: projectDocuments.documentType,
        status: projectDocuments.status,
        processingAttempts: projectDocuments.processingAttempts,
        hasFileData: sql<boolean>`${projectDocuments.fileData} is not null`,
      })
      .from(projectDocuments)
      .where(or(eq(projectDocuments.status, 'pending'), eq(projectDocuments.status, 'processing')));

    return result.map(row => ({
      id: row.id,
      tenantId: row.tenantId,
      projectId: row.projectId,
      filename: row.filename,
      contentType: row.contentType,
      documentType: row.documentType as ProjectDocumentType,
      status: row.status as DocumentProcessingStatus,
      processingAttempts: row.processingAttempts,
      hasFileData: row.hasFileData,
    }));
  }

  async incrementProcessingAttempts(id: string, tenantId: string): Promise<number> {
    const result = await db
      .update(projectDocuments)
      .set({ processingAttempts: sql`${projectDocuments.processingAttempts} + 1` })
      .where(and(eq(projectDocuments.id, id), eq(projectDocuments.tenantId, tenantId)))
      .returning({ processingAttempts: projectDocuments.processingAttempts });

    return result[0]?.processingAttempts ?? 0;
  }

  private mapRowToEntity(row: DocumentRow): ProjectDocument {
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
      structuredExtractionStatus: row.structuredExtractionStatus as 'completed' | 'failed' | null,
      structuredExtractionError: row.structuredExtractionError,
      structuredExtractionSummary: row.structuredExtractionSummary,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    });
  }
}
