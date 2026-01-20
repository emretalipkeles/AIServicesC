export interface ParsedDocumentResult {
  rawContent: string;
  metadata?: {
    pageCount?: number;
    author?: string;
    title?: string;
    createdDate?: Date;
  };
}

export interface IDocumentParser {
  canParse(contentType: string): boolean;
  parse(buffer: Buffer, filename: string): Promise<ParsedDocumentResult>;
}
