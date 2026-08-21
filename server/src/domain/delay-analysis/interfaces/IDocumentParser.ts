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
  /**
   * @param contentType MIME type of the uploaded file.
   * @param documentType Optional project-document type (e.g. 'pod'), used by factories to select
   *   a specialised parser for the same content type without branching in the caller.
   */
  canParse(contentType: string, documentType?: string): boolean;
  parse(buffer: Buffer, filename: string): Promise<ParsedDocumentResult>;
}
