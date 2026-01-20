import type { Chunk } from '../entities/Chunk';

export interface ChunkSearchResult {
  chunk: Chunk;
  score: number;
}

export interface IChunkRepository {
  save(chunk: Chunk): Promise<void>;
  saveBatch(chunks: Chunk[]): Promise<void>;
  findByDocumentId(documentId: string, tenantId: string): Promise<Chunk[]>;
  findByAgentId(agentId: string, tenantId: string): Promise<Chunk[]>;
  deleteByDocumentId(documentId: string, tenantId: string): Promise<void>;
  deleteByAgentId(agentId: string, tenantId: string): Promise<void>;
  searchSimilar(
    agentId: string,
    tenantId: string,
    queryEmbedding: number[],
    limit: number
  ): Promise<ChunkSearchResult[]>;
  searchByKeyword(
    agentId: string,
    tenantId: string,
    keyword: string,
    limit: number
  ): Promise<Chunk[]>;
}
