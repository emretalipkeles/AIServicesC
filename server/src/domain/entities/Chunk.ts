export interface ChunkMetadata {
  page?: number;
  section?: string;
  startChar?: number;
  endChar?: number;
  [key: string]: unknown;
}

export interface ChunkProps {
  id: string;
  documentId: string;
  agentId: string;
  tenantId: string;
  content: string;
  metadata: ChunkMetadata | null;
  chunkIndex: number;
  embedding?: number[];
  createdAt: Date;
}

export class Chunk {
  readonly id: string;
  readonly documentId: string;
  readonly agentId: string;
  readonly tenantId: string;
  readonly content: string;
  readonly metadata: ChunkMetadata | null;
  readonly chunkIndex: number;
  readonly embedding?: number[];
  readonly createdAt: Date;

  constructor(props: ChunkProps) {
    this.id = props.id;
    this.documentId = props.documentId;
    this.agentId = props.agentId;
    this.tenantId = props.tenantId;
    this.content = props.content;
    this.metadata = props.metadata;
    this.chunkIndex = props.chunkIndex;
    this.embedding = props.embedding;
    this.createdAt = props.createdAt;
  }

  withEmbedding(embedding: number[]): Chunk {
    return new Chunk({
      ...this,
      embedding,
    });
  }

  getContentPreview(maxLength: number = 100): string {
    if (this.content.length <= maxLength) return this.content;
    return this.content.substring(0, maxLength) + '...';
  }
}
