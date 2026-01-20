import { eq, and } from 'drizzle-orm';
import type { IDocumentRepository } from '../../../domain/repositories/IDocumentRepository';
import { Document, type DocumentStatus } from '../../../domain/entities/Document';
import { agentDocuments } from '@shared/schema';
import { db } from '../../database';

export class DrizzleDocumentRepository implements IDocumentRepository {
  async findById(id: string, tenantId: string): Promise<Document | null> {
    const result = await db
      .select()
      .from(agentDocuments)
      .where(and(eq(agentDocuments.id, id), eq(agentDocuments.tenantId, tenantId)))
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0];
    return new Document({
      id: row.id,
      agentId: row.agentId,
      tenantId: row.tenantId,
      filename: row.filename,
      contentType: row.contentType,
      rawContent: row.rawContent,
      status: row.status as DocumentStatus,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    });
  }

  async findByAgentId(agentId: string, tenantId: string): Promise<Document[]> {
    const result = await db
      .select()
      .from(agentDocuments)
      .where(and(eq(agentDocuments.agentId, agentId), eq(agentDocuments.tenantId, tenantId)));

    return result.map(row => new Document({
      id: row.id,
      agentId: row.agentId,
      tenantId: row.tenantId,
      filename: row.filename,
      contentType: row.contentType,
      rawContent: row.rawContent,
      status: row.status as DocumentStatus,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    }));
  }

  async save(document: Document): Promise<void> {
    await db.insert(agentDocuments).values({
      id: document.id,
      agentId: document.agentId,
      tenantId: document.tenantId,
      filename: document.filename,
      contentType: document.contentType,
      rawContent: document.rawContent,
      status: document.status,
      errorMessage: document.errorMessage,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    });
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: DocumentStatus,
    errorMessage?: string
  ): Promise<void> {
    await db
      .update(agentDocuments)
      .set({
        status,
        errorMessage: errorMessage ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(agentDocuments.id, id), eq(agentDocuments.tenantId, tenantId)));
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await db
      .delete(agentDocuments)
      .where(and(eq(agentDocuments.id, id), eq(agentDocuments.tenantId, tenantId)));
  }

  async deleteByAgentId(agentId: string, tenantId: string): Promise<void> {
    await db
      .delete(agentDocuments)
      .where(and(eq(agentDocuments.agentId, agentId), eq(agentDocuments.tenantId, tenantId)));
  }
}
