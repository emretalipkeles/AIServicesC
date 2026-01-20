export interface UnderstandingChunk {
  content: string;
  metadata: {
    chunkIndex: number;
    sourceSection?: string;
    keywords?: string[];
  };
}

export interface UnderstandingResult {
  success: boolean;
  chunks: UnderstandingChunk[];
  summary?: string;
  error?: string;
}

export interface IDocumentUnderstandingService {
  processDocument(
    sessionId: string,
    documentId: string,
    agentId: string,
    tenantId: string,
    rawContent: string
  ): Promise<UnderstandingResult>;
}
