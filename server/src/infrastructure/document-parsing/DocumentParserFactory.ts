import type { IDocumentParser } from '../../domain/delay-analysis/interfaces/IDocumentParser';
import type { IDocumentParserFactory } from '../../domain/delay-analysis/interfaces/IDocumentParserFactory';
import { PdfDocumentParser } from './PdfDocumentParser';
import { PdfPodDocumentParser } from './PdfPodDocumentParser';
import { WordDocumentParser } from './WordDocumentParser';

export class DocumentParserFactory implements IDocumentParserFactory {
  private readonly parsers: IDocumentParser[];

  constructor() {
    this.parsers = [
      // Ordered before PdfDocumentParser: PdfDocumentParser declines POD documents,
      // but the more specific parser is still listed first for clarity of precedence.
      new PdfPodDocumentParser(),
      new PdfDocumentParser(),
      new WordDocumentParser(),
    ];
  }

  getParser(contentType: string, documentType?: string): IDocumentParser | null {
    for (const parser of this.parsers) {
      if (parser.canParse(contentType, documentType)) {
        return parser;
      }
    }
    return null;
  }

  getSupportedContentTypes(): string[] {
    return [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
  }

  isSupported(contentType: string): boolean {
    return this.getParser(contentType) !== null;
  }
}
