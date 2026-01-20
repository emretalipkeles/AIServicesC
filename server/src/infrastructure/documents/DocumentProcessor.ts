import type { IDocumentProcessor, ProcessedChunk } from '../../application/services/IDocumentProcessor';

export class DocumentProcessor implements IDocumentProcessor {
  private readonly defaultChunkSize = 1000;
  private readonly defaultOverlap = 200;

  async extractText(content: string, contentType: string): Promise<string> {
    const lowerType = contentType.toLowerCase();
    
    if (lowerType.includes('text/plain') || lowerType.includes('text/markdown')) {
      return content;
    }
    
    if (lowerType.includes('application/json') || lowerType.includes('yaml') || lowerType.includes('yml')) {
      return content;
    }

    if (lowerType.includes('text/csv') || lowerType.includes('spreadsheet') || lowerType.includes('excel')) {
      return this.extractFromCsv(content);
    }

    return content;
  }

  chunkText(
    text: string,
    chunkSize: number = this.defaultChunkSize,
    overlap: number = this.defaultOverlap
  ): ProcessedChunk[] {
    const chunks: ProcessedChunk[] = [];
    const cleanedText = text.replace(/\r\n/g, '\n').trim();
    
    if (cleanedText.length === 0) {
      return chunks;
    }

    if (cleanedText.length <= chunkSize) {
      chunks.push({
        content: cleanedText,
        metadata: {
          startChar: 0,
          endChar: cleanedText.length,
        },
        chunkIndex: 0,
      });
      return chunks;
    }

    const paragraphs = cleanedText.split(/\n\n+/);
    let currentChunk = '';
    let currentStartChar = 0;
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length + 2 <= chunkSize) {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      } else {
        if (currentChunk) {
          chunks.push({
            content: currentChunk.trim(),
            metadata: {
              startChar: currentStartChar,
              endChar: currentStartChar + currentChunk.length,
            },
            chunkIndex: chunkIndex++,
          });
          
          const words = currentChunk.split(/\s+/);
          const overlapWords = words.slice(-Math.floor(overlap / 5));
          currentChunk = overlapWords.join(' ') + '\n\n' + paragraph;
          currentStartChar = currentStartChar + currentChunk.length - overlapWords.join(' ').length;
        } else {
          currentChunk = paragraph;
        }
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: {
          startChar: currentStartChar,
          endChar: currentStartChar + currentChunk.length,
        },
        chunkIndex: chunkIndex,
      });
    }

    return chunks;
  }

  supportsContentType(contentType: string): boolean {
    const supportedTypes = [
      'text/plain',
      'text/markdown',
      'application/json',
      'application/yaml',
      'text/yaml',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    const lowerType = contentType.toLowerCase();
    return supportedTypes.some(t => lowerType.includes(t));
  }

  private extractFromCsv(content: string): string {
    const lines = content.split('\n');
    if (lines.length === 0) return '';

    const headers = lines[0].split(',').map(h => h.trim());
    const result: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length === headers.length) {
        const row = headers.map((h, idx) => `${h}: ${values[idx]}`).join(', ');
        result.push(row);
      }
    }

    return result.join('\n');
  }
}
