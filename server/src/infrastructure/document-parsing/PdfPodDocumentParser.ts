import type { IDocumentParser, ParsedDocumentResult } from '../../domain/delay-analysis/interfaces/IDocumentParser';

interface PositionedTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
}

// Two text items are considered to be on the same visual line when their baselines
// differ by no more than this many PDF user-space units.
const LINE_Y_TOLERANCE = 3;

// When the horizontal gap between two items on the same visual line exceeds this many
// PDF user-space units, they are treated as separate columns/cells (e.g. a row-label
// column next to a value column, or two side-by-side sub-tables) rather than words in
// the same run of text, and are joined with a wider separator to preserve that boundary
// instead of collapsing it into ordinary single-space word spacing.
const COLUMN_GAP_THRESHOLD = 12;

/**
 * POD-specific PDF parser that reads text in visual reading order (top-to-bottom,
 * left-to-right) instead of PDF content-stream order.
 *
 * Play of the Day sheets are laid out as repeating blocks (headings, crew lists,
 * equipment, task/cost-code lines) whose content-stream order frequently does not
 * match their visual order — headings can be emitted after the blocks they title,
 * and cost codes can detach from their task lines. Sorting each page's text items
 * by position before assembling lines keeps every section's heading attached to
 * its own crew/equipment/task content.
 */
export class PdfPodDocumentParser implements IDocumentParser {
  canParse(contentType: string, documentType?: string): boolean {
    return contentType.toLowerCase() === 'application/pdf' && documentType === 'pod';
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
        const pageTexts: string[] = [];

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

          pageTexts.push(assembleVisualOrderText(items));
          page.cleanup();
        }

        return {
          rawContent: pageTexts.join('\n\n'),
          metadata: { pageCount: pdfDocument.numPages },
        };
      } finally {
        await pdfDocument.destroy();
      }
    } catch (error) {
      throw new Error(`Failed to parse POD PDF ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Sorts text items by visual position (top-to-bottom, then left-to-right within a line)
 * and joins them into newline-separated lines. Exported for unit testing.
 */
export function assembleVisualOrderText(items: PositionedTextItem[]): string {
  if (items.length === 0) {
    return '';
  }

  // PDF y-coordinates increase upward, so sort descending by y (top of page first).
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: PositionedTextItem[][] = [];
  for (const item of sorted) {
    const currentLine = lines[lines.length - 1];
    if (currentLine && Math.abs(currentLine[0].y - item.y) <= LINE_Y_TOLERANCE) {
      currentLine.push(item);
    } else {
      lines.push([item]);
    }
  }

  return lines
    .map(line => joinLineByColumnGaps([...line].sort((a, b) => a.x - b.x)))
    .filter(line => line.length > 0)
    .join('\n');
}

/**
 * Joins one visual line's items left-to-right, widening the separator whenever the gap
 * between two items exceeds COLUMN_GAP_THRESHOLD. This keeps ordinary word spacing tight
 * while preserving a clear boundary between side-by-side cells/columns (e.g. a "CREW"
 * row-label next to a crew member's name next to an "EQUIPMENT" column header), so that
 * downstream structural chunking can tell columnar boundaries apart from normal text.
 */
function joinLineByColumnGaps(line: PositionedTextItem[]): string {
  let result = '';
  let previous: PositionedTextItem | null = null;

  for (const item of line) {
    const text = item.text.replace(/\s+/g, ' ').trim();
    if (text.length === 0) {
      continue;
    }

    if (previous) {
      const gap = item.x - (previous.x + previous.width);
      result += gap > COLUMN_GAP_THRESHOLD ? '    ' : ' ';
    }

    result += text;
    previous = item;
  }

  return result.trim();
}
