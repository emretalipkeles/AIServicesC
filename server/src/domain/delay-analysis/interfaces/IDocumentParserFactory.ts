import type { IDocumentParser } from './IDocumentParser';

export interface IDocumentParserFactory {
  getParser(contentType: string, documentType?: string): IDocumentParser | null;
  isSupported(contentType: string): boolean;
  getSupportedContentTypes(): string[];
}
