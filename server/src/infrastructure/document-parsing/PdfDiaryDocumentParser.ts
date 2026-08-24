import type { IDocumentParser, ParsedDocumentResult } from '../../domain/delay-analysis/interfaces/IDocumentParser';
import { assembleVisualOrderText } from './PdfPodDocumentParser';

interface PositionedTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
}

// Repeated page furniture that HeavyJob stamps on every diary export page. Stripped before
// segmentation so it never pollutes note text or gets mistaken for day/author content.
// Matches lines mentioning the footer ("Jansen Inc. ... HeavyJob | https://... | phone")
// and lines that are nothing but a lone page number.
const FOOTER_LINE_PATTERN = /heavyjob|hcssapps\.com/i;
const PAGE_NUMBER_LINE_PATTERN = /^\d{1,4}$/;

/**
 * Prefix for the page-boundary marker lines this parser inserts; see DiarySegmenter's PAGE_MARKER.
 *
 * Uses a Unicode Private Use Area code point rather than NUL (`\u0000`): the marker line is part
 * of `rawContent`, which is persisted verbatim to a Postgres `text` column before segmentation
 * ever runs. Postgres text columns reject embedded NUL bytes outright ("invalid byte sequence for
 * encoding UTF8"), which made every diary upload fail at parse time regardless of document
 * content. `\uE000` is valid UTF-8, never appears in real PDF text, and round-trips through
 * Postgres cleanly.
 */
export const PAGE_MARKER_PREFIX = '\uE000PAGE:';

/**
 * Diary-specific PDF parser for Jansen's HeavyJob Foreman Diary exports.
 *
 * Reuses POD's visual-order text assembly (top-to-bottom, left-to-right, line grouping by
 * y-tolerance) since diary pages have the same "content-stream order doesn't match visual
 * order" problem: a "Diary" row label, its author, and its notes can be emitted out of
 * reading order. Unlike POD, all pages are concatenated into one continuous text stream
 * (not paragraph-separated) so day sections and notes that straddle a page boundary stay
 * intact for the day/author segmenter that runs after this parser.
 *
 * Text only: this parser never rasterizes pages or performs OCR. Diary PDFs are
 * picture-heavy, but the pictures are out of scope and not worth the tokens.
 */
export class PdfDiaryDocumentParser implements IDocumentParser {
  canParse(contentType: string, documentType?: string): boolean {
    return contentType.toLowerCase() === 'application/pdf' && documentType === 'daily_report';
  }

  async parse(buffer: Buffer, filename: string): Promise<ParsedDocumentResult> {
    try {
      // Loaded lazily: pdfjs-dist's legacy Node build is CJS-unfriendly at the top level.
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

      const loadingTask = getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
        isEvalSupported: false,
      });
      const pdfDocument = await loadingTask.promise;

      try {
        const pageLines: string[] = [];

        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
          const page = await pdfDocument.getPage(pageNumber);
          const textContent = await page.getTextContent();

          const items: PositionedTextItem[] = textContent.items
            .filter((item: any): item is { str: string; transform: number[] } =>
              typeof item.str === 'string' && item.str.trim().length > 0 && Array.isArray(item.transform))
            .map((item: any) => ({
              text: item.str,
              x: item.transform[4],
              y: item.transform[5],
              width: typeof item.width === 'number' ? item.width : item.str.length * 5,
            }));

          const pageText = assembleVisualOrderText(items);
          // A page-boundary marker the segmenter uses to attribute each entry to the PDF
          // page(s) it started/ended on, so Results-tab evidence can reference a page number.
          // Not real diary content, so it's inserted after furniture-stripping and stripped
          // back out by the segmenter before any text reaches note bodies.
          pageLines.push(`${PAGE_MARKER_PREFIX}${pageNumber}`);
          pageLines.push(...stripPageFurniture(pageText));
          page.cleanup();
        }

        return {
          rawContent: pageLines.join('\n'),
          metadata: { pageCount: pdfDocument.numPages },
        };
      } finally {
        await pdfDocument.destroy();
      }
    } catch (error) {
      throw new Error(`Failed to parse Foreman Diary PDF ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Removes repeated page furniture (page numbers, the "Jansen Inc. ... HeavyJob ..." footer)
 * from one page's assembled lines. Exported for unit testing.
 */
export function stripPageFurniture(pageText: string): string[] {
  return pageText
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return true; // preserve blank lines as paragraph separators
      if (PAGE_NUMBER_LINE_PATTERN.test(trimmed)) return false;
      if (FOOTER_LINE_PATTERN.test(trimmed)) return false;
      return true;
    });
}
