import { eq, and, lt, sql } from 'drizzle-orm';
import type { IProcessingSessionRepository } from '../../../domain/repositories/IProcessingSessionRepository';
import { ProcessingSession, type ProcessingStage } from '../../../domain/entities/ProcessingSession';
import { ProcessingMessage, type MessageRole } from '../../../domain/entities/ProcessingMessage';
import { documentProcessingSessions, processingMessages } from '@shared/schema';
import { db } from '..';

export class PostgresProcessingSessionRepository implements IProcessingSessionRepository {
  async findById(id: string, tenantId: string): Promise<ProcessingSession | null> {
    const rows = await db
      .select()
      .from(documentProcessingSessions)
      .where(and(
        eq(documentProcessingSessions.id, id),
        eq(documentProcessingSessions.tenantId, tenantId)
      ))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapToEntity(rows[0]);
  }

  async findByDocumentId(documentId: string, tenantId: string): Promise<ProcessingSession | null> {
    const rows = await db
      .select()
      .from(documentProcessingSessions)
      .where(and(
        eq(documentProcessingSessions.documentId, documentId),
        eq(documentProcessingSessions.tenantId, tenantId)
      ))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapToEntity(rows[0]);
  }

  async save(session: ProcessingSession): Promise<void> {
    await db
      .insert(documentProcessingSessions)
      .values({
        id: session.id,
        documentId: session.documentId,
        agentId: session.agentId,
        tenantId: session.tenantId,
        stage: session.stage,
        rawContent: session.rawContent,
        totalChunks: session.totalChunks,
        processedChunks: session.processedChunks,
        aiSummary: session.aiSummary,
        errorMessage: session.errorMessage,
      })
      .onConflictDoUpdate({
        target: documentProcessingSessions.id,
        set: {
          stage: session.stage,
          rawContent: session.rawContent,
          totalChunks: session.totalChunks,
          processedChunks: session.processedChunks,
          aiSummary: session.aiSummary,
          errorMessage: session.errorMessage,
          completedAt: session.completedAt,
        },
      });
  }

  async updateStage(id: string, tenantId: string, stage: ProcessingStage, errorMessage?: string): Promise<void> {
    const completedAt = (stage === 'completed' || stage === 'failed') ? new Date() : null;
    await db
      .update(documentProcessingSessions)
      .set({ 
        stage, 
        errorMessage: errorMessage ?? null,
        completedAt,
      })
      .where(and(
        eq(documentProcessingSessions.id, id),
        eq(documentProcessingSessions.tenantId, tenantId)
      ));
  }

  async updateProgress(id: string, tenantId: string, processedChunks: number): Promise<void> {
    await db
      .update(documentProcessingSessions)
      .set({ processedChunks })
      .where(and(
        eq(documentProcessingSessions.id, id),
        eq(documentProcessingSessions.tenantId, tenantId)
      ));
  }

  async updateSummary(id: string, tenantId: string, summary: string): Promise<void> {
    await db
      .update(documentProcessingSessions)
      .set({ aiSummary: summary })
      .where(and(
        eq(documentProcessingSessions.id, id),
        eq(documentProcessingSessions.tenantId, tenantId)
      ));
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await db
      .delete(documentProcessingSessions)
      .where(and(
        eq(documentProcessingSessions.id, id),
        eq(documentProcessingSessions.tenantId, tenantId)
      ));
  }

  async deleteCompleted(olderThanHours: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - olderThanHours);

    const result = await db
      .delete(documentProcessingSessions)
      .where(and(
        eq(documentProcessingSessions.stage, 'completed'),
        lt(documentProcessingSessions.completedAt, cutoff)
      ));

    return result.rowCount ?? 0;
  }

  async saveMessage(message: ProcessingMessage): Promise<void> {
    await db.insert(processingMessages).values({
      id: message.id,
      sessionId: message.sessionId,
      role: message.role,
      content: message.content,
      chunkIndex: message.chunkIndex,
    });
  }

  async getMessages(sessionId: string): Promise<ProcessingMessage[]> {
    const rows = await db
      .select()
      .from(processingMessages)
      .where(eq(processingMessages.sessionId, sessionId))
      .orderBy(processingMessages.createdAt);

    return rows.map(row => new ProcessingMessage({
      id: row.id,
      sessionId: row.sessionId,
      role: row.role as MessageRole,
      content: row.content,
      chunkIndex: row.chunkIndex,
      createdAt: row.createdAt!,
    }));
  }

  async deleteMessages(sessionId: string): Promise<void> {
    await db
      .delete(processingMessages)
      .where(eq(processingMessages.sessionId, sessionId));
  }

  private mapToEntity(row: typeof documentProcessingSessions.$inferSelect): ProcessingSession {
    return new ProcessingSession({
      id: row.id,
      documentId: row.documentId,
      agentId: row.agentId,
      tenantId: row.tenantId,
      stage: row.stage as ProcessingStage,
      rawContent: row.rawContent,
      totalChunks: row.totalChunks,
      processedChunks: row.processedChunks,
      aiSummary: row.aiSummary,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt!,
      completedAt: row.completedAt,
    });
  }
}
