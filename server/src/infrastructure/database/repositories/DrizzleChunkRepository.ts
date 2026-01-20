import { eq, and, sql, ilike } from 'drizzle-orm';
import type { IChunkRepository, ChunkSearchResult } from '../../../domain/repositories/IChunkRepository';
import { Chunk, type ChunkMetadata } from '../../../domain/entities/Chunk';
import { agentChunks } from '@shared/schema';
import { db } from '../../database';

export class DrizzleChunkRepository implements IChunkRepository {
  async save(chunk: Chunk): Promise<void> {
    await db.insert(agentChunks).values({
      id: chunk.id,
      documentId: chunk.documentId,
      agentId: chunk.agentId,
      tenantId: chunk.tenantId,
      content: chunk.content,
      metadata: chunk.metadata ? JSON.stringify(chunk.metadata) : null,
      chunkIndex: chunk.chunkIndex,
      createdAt: chunk.createdAt,
    });
  }

  async saveBatch(chunks: Chunk[]): Promise<void> {
    if (chunks.length === 0) return;

    await db.insert(agentChunks).values(
      chunks.map(chunk => ({
        id: chunk.id,
        documentId: chunk.documentId,
        agentId: chunk.agentId,
        tenantId: chunk.tenantId,
        content: chunk.content,
        metadata: chunk.metadata ? JSON.stringify(chunk.metadata) : null,
        chunkIndex: chunk.chunkIndex,
        createdAt: chunk.createdAt,
      }))
    );
  }

  async findByDocumentId(documentId: string, tenantId: string): Promise<Chunk[]> {
    const result = await db
      .select()
      .from(agentChunks)
      .where(and(eq(agentChunks.documentId, documentId), eq(agentChunks.tenantId, tenantId)));

    return result.map(row => this.rowToChunk(row));
  }

  async findByAgentId(agentId: string, tenantId: string): Promise<Chunk[]> {
    const result = await db
      .select()
      .from(agentChunks)
      .where(and(eq(agentChunks.agentId, agentId), eq(agentChunks.tenantId, tenantId)));

    return result.map(row => this.rowToChunk(row));
  }

  async deleteByDocumentId(documentId: string, tenantId: string): Promise<void> {
    await db
      .delete(agentChunks)
      .where(and(eq(agentChunks.documentId, documentId), eq(agentChunks.tenantId, tenantId)));
  }

  async deleteByAgentId(agentId: string, tenantId: string): Promise<void> {
    await db
      .delete(agentChunks)
      .where(and(eq(agentChunks.agentId, agentId), eq(agentChunks.tenantId, tenantId)));
  }

  async searchSimilar(
    agentId: string,
    tenantId: string,
    _queryEmbedding: number[],
    limit: number
  ): Promise<ChunkSearchResult[]> {
    const result = await db
      .select()
      .from(agentChunks)
      .where(and(eq(agentChunks.agentId, agentId), eq(agentChunks.tenantId, tenantId)))
      .limit(limit);

    return result.map(row => ({
      chunk: this.rowToChunk(row),
      score: 1.0,
    }));
  }

  async searchByKeyword(
    agentId: string,
    tenantId: string,
    keyword: string,
    limit: number
  ): Promise<Chunk[]> {
    const result = await db
      .select()
      .from(agentChunks)
      .where(
        and(
          eq(agentChunks.agentId, agentId),
          eq(agentChunks.tenantId, tenantId),
          ilike(agentChunks.content, `%${keyword}%`)
        )
      )
      .limit(limit);

    return result.map(row => this.rowToChunk(row));
  }

  private rowToChunk(row: typeof agentChunks.$inferSelect): Chunk {
    let metadata: ChunkMetadata | null = null;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata);
      } catch {
        metadata = null;
      }
    }

    return new Chunk({
      id: row.id,
      documentId: row.documentId,
      agentId: row.agentId,
      tenantId: row.tenantId,
      content: row.content,
      metadata,
      chunkIndex: row.chunkIndex,
      createdAt: row.createdAt ?? new Date(),
    });
  }
}
