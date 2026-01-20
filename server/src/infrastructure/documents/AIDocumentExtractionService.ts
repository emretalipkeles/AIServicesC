import type { 
  IDocumentExtractionService, 
  ExtractionResult, 
  ExtractedDocument,
  ExtractionProgressCallback
} from '../../application/services/IDocumentExtractionService';
import type { IAIClientProvider } from '../ai/AIClientProvider';
import { ModelId } from '../../domain/value-objects/ModelId';
import { AIMessage } from '../../domain/value-objects/AIMessage';
import { NativeDocumentParser } from './NativeDocumentParser';

interface ZipEntry {
  filename: string;
  buffer: Buffer;
  mimeType: string;
}

export class AIDocumentExtractionService implements IDocumentExtractionService {
  private readonly nativeParser = new NativeDocumentParser();
  private readonly supportedMimeTypes = [
    'text/plain',
    'text/markdown',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/zip',
    'application/x-zip-compressed',
  ];

  private readonly extensionToMimeType: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.zip': 'application/zip',
  };

  constructor(private readonly aiClientProvider: IAIClientProvider) {}

  async extractFromBuffer(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    onProgress?: ExtractionProgressCallback
  ): Promise<ExtractionResult> {
    const resolvedMimeType = this.resolveMimeType(filename, mimeType);

    if (!this.isSupported(resolvedMimeType, filename)) {
      return {
        success: false,
        documents: [],
        errors: [{ filename, error: `Unsupported file type: ${resolvedMimeType}` }],
        skipped: [],
      };
    }

    if (this.isZipFile(resolvedMimeType, filename)) {
      return this.extractFromZip(buffer, filename, onProgress);
    }

    return this.extractSingleDocument(buffer, filename, resolvedMimeType, onProgress);
  }

  getSupportedMimeTypes(): string[] {
    return [...this.supportedMimeTypes];
  }

  isSupported(mimeType: string, filename: string): boolean {
    const resolvedMimeType = this.resolveMimeType(filename, mimeType);
    const ext = this.getExtension(filename);

    return (
      this.supportedMimeTypes.some(t => resolvedMimeType.includes(t)) ||
      Object.keys(this.extensionToMimeType).includes(ext)
    );
  }

  private resolveMimeType(filename: string, mimeType: string): string {
    if (mimeType && mimeType !== 'application/octet-stream') {
      return mimeType;
    }
    const ext = this.getExtension(filename);
    return this.extensionToMimeType[ext] || mimeType;
  }

  private getExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : '';
  }

  private isZipFile(mimeType: string, filename: string): boolean {
    return (
      mimeType.includes('zip') ||
      filename.toLowerCase().endsWith('.zip')
    );
  }

  private isTextFile(mimeType: string, filename: string): boolean {
    const ext = this.getExtension(filename);
    return (
      mimeType.includes('text/plain') ||
      mimeType.includes('text/markdown') ||
      ext === '.txt' ||
      ext === '.md'
    );
  }

  private async extractSingleDocument(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    onProgress?: ExtractionProgressCallback
  ): Promise<ExtractionResult> {
    try {
      let content: string;
      let extractionMethod: 'direct' | 'ai' | 'parsed';

      const nativeResult = await this.nativeParser.parseBuffer(buffer, filename, mimeType, onProgress);
      
      if (nativeResult.success && nativeResult.content.trim().length > 0) {
        content = nativeResult.content;
        extractionMethod = this.isTextFile(mimeType, filename) ? 'direct' : 'parsed';
      } else {
        console.log(`Native parsing failed for ${filename}, reason: ${nativeResult.error || 'unknown'}`);
        return {
          success: false,
          documents: [],
          errors: [{ filename, error: nativeResult.error || 'Failed to extract content from file' }],
          skipped: [],
        };
      }

      if (!content || content.trim().length === 0) {
        return {
          success: false,
          documents: [],
          errors: [{ filename, error: 'No content could be extracted from the file' }],
          skipped: [],
        };
      }

      const document: ExtractedDocument = {
        filename,
        content: content.trim(),
        originalMimeType: mimeType,
        extractionMethod,
      };

      return {
        success: true,
        documents: [document],
        errors: [],
        skipped: [],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown extraction error';
      return {
        success: false,
        documents: [],
        errors: [{ filename, error: errorMessage }],
        skipped: [],
      };
    }
  }

  private async extractWithAI(
    buffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<string> {
    const aiClient = this.aiClientProvider.getClient();
    if (!aiClient) {
      throw new Error('AI client not configured. Cannot extract content from complex file types.');
    }

    const base64Content = buffer.toString('base64');
    const ext = this.getExtension(filename);
    
    let fileTypeDescription = 'document';
    if (ext === '.pdf') {
      fileTypeDescription = 'PDF document';
    } else if (ext === '.docx' || ext === '.doc') {
      fileTypeDescription = 'Word document';
    } else if (ext === '.xlsx' || ext === '.xls') {
      fileTypeDescription = 'Excel spreadsheet';
    }

    const systemPrompt = `You are a document content extraction assistant. Your job is to extract all meaningful text content from the provided ${fileTypeDescription}.

Instructions:
- Extract all text content, preserving the logical structure
- For spreadsheets, format data as readable text with clear headers and values
- For documents, maintain paragraph structure and headings
- Remove any formatting artifacts or binary garbage
- If the document contains tables, represent them in a clear text format
- Do not add commentary or explanations - just extract the raw content
- If you cannot read the content, respond with: [EXTRACTION_FAILED]`;

    const userMessage = `Please extract all text content from this ${fileTypeDescription} (filename: ${filename}).

The file is provided as base64-encoded data. Extract and return only the text content.

Base64 content:
${base64Content}`;

    try {
      const response = await aiClient.chat({
        model: ModelId.gpt52(),
        messages: [AIMessage.user(userMessage)],
        systemPrompt,
        maxTokens: 100000,
        temperature: 0,
      });

      if (response.content.includes('[EXTRACTION_FAILED]')) {
        throw new Error('AI could not extract content from the file');
      }

      return response.content;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'AI extraction failed';
      throw new Error(`Failed to extract content using AI: ${errorMessage}`);
    }
  }

  private async extractFromZip(
    buffer: Buffer,
    zipFilename: string,
    onProgress?: ExtractionProgressCallback
  ): Promise<ExtractionResult> {
    const AdmZip = await import('adm-zip');
    const zip = new AdmZip.default(buffer);

    const maxEntries = 50;
    const maxEntrySize = 10 * 1024 * 1024;
    const maxTotalSize = 50 * 1024 * 1024;

    const entries = zip.getEntries();
    
    if (entries.length > maxEntries) {
      return {
        success: false,
        documents: [],
        errors: [{ 
          filename: zipFilename, 
          error: `ZIP contains too many files (${entries.length}). Maximum allowed: ${maxEntries}` 
        }],
        skipped: [],
      };
    }

    const documents: ExtractedDocument[] = [];
    const errors: Array<{ filename: string; error: string }> = [];
    const skipped: Array<{ filename: string; reason: string }> = [];
    let totalSize = 0;

    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const entryFilename = entry.entryName;
      const ext = this.getExtension(entryFilename);
      
      if (!Object.keys(this.extensionToMimeType).includes(ext) || ext === '.zip') {
        skipped.push({ 
          filename: entryFilename, 
          reason: `Unsupported file type: ${ext || 'no extension'}` 
        });
        continue;
      }

      const entrySize = entry.header.size;
      if (entrySize > maxEntrySize) {
        skipped.push({ 
          filename: entryFilename, 
          reason: `File too large: ${Math.round(entrySize / 1024 / 1024)}MB (max: ${maxEntrySize / 1024 / 1024}MB)` 
        });
        continue;
      }

      totalSize += entrySize;
      if (totalSize > maxTotalSize) {
        skipped.push({ 
          filename: entryFilename, 
          reason: 'Total extracted size limit exceeded' 
        });
        continue;
      }

      try {
        const entryBuffer = entry.getData();
        const entryMimeType = this.extensionToMimeType[ext] || 'application/octet-stream';
        
        const result = await this.extractSingleDocument(entryBuffer, entryFilename, entryMimeType, onProgress);
        
        if (result.success && result.documents.length > 0) {
          documents.push(...result.documents);
        } else if (result.errors.length > 0) {
          errors.push(...result.errors);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Extraction failed';
        errors.push({ filename: entryFilename, error: errorMessage });
      }
    }

    return {
      success: documents.length > 0,
      documents,
      errors,
      skipped,
    };
  }
}
