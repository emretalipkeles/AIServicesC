import type { IDocumentParser, ParsedDocumentResult } from '../../domain/delay-analysis/interfaces/IDocumentParser';
import * as pdfParse from 'pdf-parse';

export class PdfDocumentParser implements IDocumentParser {
  private readonly supportedTypes = [
    'application/pdf',
  ];

  canParse(contentType: string): boolean {
    return this.supportedTypes.includes(contentType.toLowerCase());
  }

  async parse(buffer: Buffer, filename: string): Promise<ParsedDocumentResult> {
    try {
      const pdf = (pdfParse as any).default || pdfParse;
      const data = await pdf(buffer);
      
      return {
        rawContent: data.text,
        metadata: {
          pageCount: data.numpages,
          title: data.info?.Title || undefined,
          author: data.info?.Author || undefined,
          createdDate: data.info?.CreationDate ? new Date(data.info.CreationDate) : undefined,
        },
      };
    } catch (error) {
      throw new Error(`Failed to parse PDF ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
