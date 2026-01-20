export interface ProcessedChunk {
  content: string;
  metadata: {
    page?: number;
    section?: string;
    startChar: number;
    endChar: number;
  };
  chunkIndex: number;
}

export interface IDocumentProcessor {
  extractText(content: string, contentType: string): Promise<string>;
  chunkText(text: string, chunkSize?: number, overlap?: number): ProcessedChunk[];
  supportsContentType(contentType: string): boolean;
}
