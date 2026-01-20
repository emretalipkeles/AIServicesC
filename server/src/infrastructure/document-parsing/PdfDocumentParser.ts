import type { IDocumentParser, ParsedDocumentResult } from '../../domain/delay-analysis/interfaces/IDocumentParser';
import { PDFParse } from 'pdf-parse';

export class PdfDocumentParser implements IDocumentParser {
  private readonly supportedTypes = [
    'application/pdf',
  ];

  canParse(contentType: string): boolean {
    return this.supportedTypes.includes(contentType.toLowerCase());
  }

  async parse(buffer: Buffer, filename: string): Promise<ParsedDocumentResult> {
    const parser = new PDFParse({ data: buffer });
    try {
      const pdfData = await parser.getText();
      const text = pdfData.text;
      
      return {
        rawContent: text,
        metadata: {
          pageCount: pdfData.pages?.length || 1,
          title: undefined,
          author: undefined,
          createdDate: undefined,
        },
      };
    } catch (error) {
      throw new Error(`Failed to parse PDF ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      await parser.destroy();
    }
  }
}
