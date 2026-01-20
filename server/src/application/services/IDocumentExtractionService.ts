export interface ExtractedDocument {
  filename: string;
  content: string;
  originalMimeType: string;
  extractionMethod: 'direct' | 'ai' | 'parsed';
}

export interface ExtractionResult {
  success: boolean;
  documents: ExtractedDocument[];
  errors: Array<{ filename: string; error: string }>;
  skipped: Array<{ filename: string; reason: string }>;
}

export type ExtractionProgressCallback = (message: string) => void;

export interface IDocumentExtractionService {
  extractFromBuffer(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    onProgress?: ExtractionProgressCallback
  ): Promise<ExtractionResult>;

  getSupportedMimeTypes(): string[];

  isSupported(mimeType: string, filename: string): boolean;
}
