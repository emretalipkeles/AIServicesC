import type { IDocumentParser } from './IDocumentParser';

export interface IDocumentParserFactory {
  getParser(contentType: string): IDocumentParser | null;
  isSupported(contentType: string): boolean;
  getSupportedContentTypes(): string[];
}
