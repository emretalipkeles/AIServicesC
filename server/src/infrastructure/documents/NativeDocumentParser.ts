import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { getDocumentProxy, extractText } from 'unpdf';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface ParseResult {
  success: boolean;
  content: string;
  error?: string;
  extractionMethod?: 'pdf-parse' | 'unpdf' | 'tesseract-ocr';
}

export type ProgressCallback = (message: string) => void;

export class NativeDocumentParser {
  async parseBuffer(
    buffer: Buffer, 
    filename: string, 
    mimeType: string,
    onProgress?: ProgressCallback
  ): Promise<ParseResult> {
    const ext = this.getExtension(filename).toLowerCase();

    try {
      if (this.isTextFile(ext, mimeType)) {
        onProgress?.('Reading text file...');
        return {
          success: true,
          content: buffer.toString('utf-8'),
        };
      }

      if (this.isPdfFile(ext, mimeType)) {
        return await this.parsePdf(buffer, onProgress);
      }

      if (this.isWordFile(ext, mimeType)) {
        onProgress?.('Reading Word document...');
        return await this.parseWord(buffer);
      }

      if (this.isExcelFile(ext, mimeType)) {
        onProgress?.('Reading spreadsheet...');
        return await this.parseExcel(buffer);
      }

      return {
        success: false,
        content: '',
        error: `Unsupported file type: ${ext || mimeType}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
      return {
        success: false,
        content: '',
        error: errorMessage,
      };
    }
  }

  private readonly MIN_CHARS_PER_PAGE = 100;
  private readonly PAGE_MARKER_PATTERN = /^[\s\-]*\d+\s+(of|\/)\s+\d+[\s\-]*$/gim;

  private async parsePdf(buffer: Buffer, onProgress?: ProgressCallback): Promise<ParseResult> {
    onProgress?.('Reading PDF document...');
    const pdfParseResult = await this.tryPdfParse(buffer);
    
    if (pdfParseResult.success && pdfParseResult.content) {
      const pageCount = pdfParseResult.pageCount || 1;
      const charsPerPage = pdfParseResult.content.length / pageCount;
      const isOnlyPageMarkers = this.isContentOnlyPageMarkers(pdfParseResult.content);
      
      if (charsPerPage >= this.MIN_CHARS_PER_PAGE && !isOnlyPageMarkers) {
        console.log(`[PdfParser] pdf-parse succeeded: ${pdfParseResult.content.length} chars, ${pageCount} pages, ${Math.round(charsPerPage)} chars/page`);
        onProgress?.('Document read successfully!');
        return {
          success: true,
          content: pdfParseResult.content,
          extractionMethod: 'pdf-parse',
        };
      }
      
      console.log(`[PdfParser] pdf-parse returned low content (${Math.round(charsPerPage)} chars/page, markers-only: ${isOnlyPageMarkers}), trying unpdf fallback...`);
    } else {
      console.log(`[PdfParser] pdf-parse failed: ${pdfParseResult.error}, trying unpdf fallback...`);
    }

    onProgress?.('Analyzing document structure...');
    const unpdfResult = await this.tryUnpdf(buffer);
    
    if (unpdfResult.success && unpdfResult.content) {
      const unpdfPageCount = unpdfResult.pageCount || this.estimatePageCount(unpdfResult.content);
      const unpdfCharsPerPage = unpdfResult.content.length / unpdfPageCount;
      const unpdfIsOnlyPageMarkers = this.isContentOnlyPageMarkers(unpdfResult.content);
      
      if (unpdfCharsPerPage >= this.MIN_CHARS_PER_PAGE && !unpdfIsOnlyPageMarkers) {
        console.log(`[PdfParser] unpdf succeeded: ${unpdfResult.content.length} chars, ${unpdfPageCount} pages`);
        onProgress?.('Document analyzed successfully!');
        return {
          success: true,
          content: unpdfResult.content,
          extractionMethod: 'unpdf',
        };
      }
      
      console.log(`[PdfParser] unpdf also returned low content (${Math.round(unpdfCharsPerPage)} chars/page), trying Tesseract OCR...`);
    } else {
      console.log(`[PdfParser] unpdf failed: ${unpdfResult.error}, trying Tesseract OCR...`);
    }

    onProgress?.('Scanning document pages... This may take a moment.');
    const ocrResult = await this.tryTesseractOcr(buffer, onProgress);
    
    if (ocrResult.success && ocrResult.content) {
      console.log(`[PdfParser] Tesseract OCR succeeded: ${ocrResult.content.length} chars`);
      onProgress?.('Document scanned successfully!');
      return {
        success: true,
        content: ocrResult.content,
        extractionMethod: 'tesseract-ocr',
      };
    }

    return {
      success: false,
      content: '',
      error: `PDF parsing failed with all methods. pdf-parse: ${pdfParseResult.error || 'low content'}, unpdf: ${unpdfResult.error || 'low content'}, tesseract-ocr: ${ocrResult.error || 'unknown error'}`,
    };
  }

  private isContentOnlyPageMarkers(content: string): boolean {
    const cleanedContent = content
      .replace(this.PAGE_MARKER_PATTERN, '')
      .replace(/[\s\-]+/g, '')
      .trim();
    
    return cleanedContent.length < 50;
  }

  private async tryPdfParse(buffer: Buffer): Promise<{ success: boolean; content: string; pageCount?: number; error?: string }> {
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      const content = result.text?.trim() || '';
      const pageCount = (result as any).numpages || this.estimatePageCount(content);

      await parser.destroy();

      if (!content) {
        return {
          success: false,
          content: '',
          error: 'No text extracted',
        };
      }

      return {
        success: true,
        content,
        pageCount,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private estimatePageCount(content: string): number {
    const pageMarkerMatches = content.match(/\d+\s+(of|\/)\s+(\d+)/gi);
    if (pageMarkerMatches && pageMarkerMatches.length > 0) {
      const lastMatch = pageMarkerMatches[pageMarkerMatches.length - 1];
      const totalMatch = lastMatch.match(/(\d+)$/);
      if (totalMatch) {
        return parseInt(totalMatch[1], 10);
      }
    }
    return Math.max(1, Math.ceil(content.length / 3000));
  }

  private async tryUnpdf(buffer: Buffer): Promise<{ success: boolean; content: string; pageCount?: number; error?: string }> {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { totalPages, text } = await extractText(pdf, { mergePages: true });
      const content = text?.trim() || '';

      if (!content) {
        return {
          success: false,
          content: '',
          pageCount: totalPages,
          error: 'No text extracted',
        };
      }

      return {
        success: true,
        content,
        pageCount: totalPages,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async tryTesseractOcr(buffer: Buffer, onProgress?: ProgressCallback): Promise<{ success: boolean; content: string; error?: string }> {
    let tempDir: string | null = null;
    
    try {
      console.log(`[PdfParser] Starting Tesseract OCR extraction via Poppler...`);
      onProgress?.('Preparing document for scanning...');
      
      // Create temp directory
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-ocr-'));
      const pdfPath = path.join(tempDir, 'input.pdf');
      const outputPrefix = path.join(tempDir, 'page');
      
      // Write PDF to temp file
      await fs.writeFile(pdfPath, buffer);
      
      // Convert PDF pages to PNG images using pdftoppm (Poppler)
      try {
        await execAsync(`pdftoppm -png -r 150 "${pdfPath}" "${outputPrefix}"`, {
          timeout: 120000, // 2 minute timeout
        });
      } catch (popplerError) {
        const errorMsg = popplerError instanceof Error ? popplerError.message : 'Unknown error';
        console.log(`[PdfParser] Poppler pdftoppm failed: ${errorMsg}`);
        return {
          success: false,
          content: '',
          error: `Poppler conversion failed: ${errorMsg}`,
        };
      }
      
      // Find all generated PNG files
      const files = await fs.readdir(tempDir);
      const pngFiles = files
        .filter(f => f.startsWith('page') && f.endsWith('.png'))
        .sort();
      
      if (pngFiles.length === 0) {
        return {
          success: false,
          content: '',
          error: 'No pages extracted from PDF',
        };
      }
      
      const totalPages = pngFiles.length;
      console.log(`[PdfParser] Poppler extracted ${totalPages} pages, running Tesseract OCR...`);
      onProgress?.(`Found ${totalPages} page${totalPages > 1 ? 's' : ''} to scan...`);
      
      // Dynamic import tesseract.js
      const Tesseract = await import('tesseract.js');
      
      // Configure worker with local traineddata path
      const langPath = path.resolve(process.cwd(), 'server/static/tessdata');
      const worker = await Tesseract.createWorker('eng', 1, {
        langPath,
        logger: (m: { status?: string }) => {
          if (m.status === 'recognizing text') {
            // Silently track progress
          }
        },
      });
      
      const pageTexts: string[] = [];
      
      // OCR each page
      for (let i = 0; i < pngFiles.length; i++) {
        const pngFile = pngFiles[i];
        const imagePath = path.join(tempDir, pngFile);
        const pageNum = i + 1;
        
        // Emit progress for every few pages
        if (totalPages <= 5 || pageNum === 1 || pageNum % 3 === 0 || pageNum === totalPages) {
          onProgress?.(`Scanning page ${pageNum} of ${totalPages}...`);
        }
        
        try {
          const { data: { text } } = await worker.recognize(imagePath);
          if (text && text.trim()) {
            pageTexts.push(text.trim());
          }
        } catch (ocrError) {
          console.log(`[PdfParser] OCR failed for page ${pngFile}: ${ocrError}`);
        }
      }
      
      // Terminate the worker
      await worker.terminate();
      
      const content = pageTexts.join('\n\n---\n\n').trim();
      
      if (!content) {
        return {
          success: false,
          content: '',
          error: 'No text extracted via OCR from any pages',
        };
      }
      
      console.log(`[PdfParser] Tesseract OCR completed: ${content.length} chars from ${pageTexts.length} pages`);
      onProgress?.('Finishing up...');
      
      return {
        success: true,
        content,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown OCR error';
      console.log(`[PdfParser] Tesseract OCR failed: ${errorMsg}`);
      return {
        success: false,
        content: '',
        error: errorMsg,
      };
    } finally {
      // Clean up temp directory
      if (tempDir) {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  private async parseWord(buffer: Buffer): Promise<ParseResult> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const content = result.value?.trim();

      if (!content) {
        return {
          success: false,
          content: '',
          error: 'Word document contains no extractable text',
        };
      }

      return {
        success: true,
        content,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: `Word parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async parseExcel(buffer: Buffer): Promise<ParseResult> {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheets: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csvContent = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        
        if (csvContent.trim()) {
          sheets.push(`=== Sheet: ${sheetName} ===\n${csvContent}`);
        }
      }

      const content = sheets.join('\n\n');

      if (!content.trim()) {
        return {
          success: false,
          content: '',
          error: 'Excel file contains no data',
        };
      }

      return {
        success: true,
        content,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: `Excel parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private getExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot >= 0 ? filename.slice(lastDot) : '';
  }

  private isTextFile(ext: string, mimeType: string): boolean {
    return (
      ext === '.txt' ||
      ext === '.md' ||
      mimeType.includes('text/plain') ||
      mimeType.includes('text/markdown')
    );
  }

  private isPdfFile(ext: string, mimeType: string): boolean {
    return ext === '.pdf' || mimeType.includes('application/pdf');
  }

  private isWordFile(ext: string, mimeType: string): boolean {
    return (
      ext === '.docx' ||
      ext === '.doc' ||
      mimeType.includes('wordprocessingml') ||
      mimeType.includes('msword')
    );
  }

  private isExcelFile(ext: string, mimeType: string): boolean {
    return (
      ext === '.xlsx' ||
      ext === '.xls' ||
      mimeType.includes('spreadsheetml') ||
      mimeType.includes('ms-excel')
    );
  }
}
