import type { IDocumentParser, ParsedDocumentResult } from '../../domain/delay-analysis/interfaces/IDocumentParser';
import mammoth from 'mammoth';

export class WordDocumentParser implements IDocumentParser {
  private readonly supportedTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ];

  canParse(contentType: string): boolean {
    return this.supportedTypes.includes(contentType.toLowerCase());
  }

  async parse(buffer: Buffer, filename: string): Promise<ParsedDocumentResult> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      
      return {
        rawContent: result.value,
        metadata: {},
      };
    } catch (error) {
      throw new Error(`Failed to parse Word document ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
