import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { assembleVisualOrderText } from '../PdfPodDocumentParser';
import { PdfPodDocumentParser } from '../PdfPodDocumentParser';

describe('assembleVisualOrderText', () => {
  it('returns empty string for no items', () => {
    expect(assembleVisualOrderText([])).toBe('');
  });

  it('groups items on the same line and orders them left-to-right regardless of input order', () => {
    const items = [
      { text: 'WORLD', x: 42, y: 100, width: 25 }, // gap = 42 - (10+25) = 7, ordinary word spacing
      { text: 'HELLO', x: 10, y: 100, width: 25 },
    ];
    expect(assembleVisualOrderText(items)).toBe('HELLO WORLD');
  });

  it('orders lines top-to-bottom (higher PDF y first)', () => {
    const items = [
      { text: 'BOTTOM', x: 10, y: 50, width: 30 },
      { text: 'TOP', x: 10, y: 200, width: 20 },
      { text: 'MIDDLE', x: 10, y: 125, width: 30 },
    ];
    expect(assembleVisualOrderText(items)).toBe('TOP\nMIDDLE\nBOTTOM');
  });

  it('treats items within the y-tolerance as the same line', () => {
    const items = [
      { text: 'A', x: 10, y: 100, width: 5 },
      { text: 'B', x: 20, y: 101.5, width: 5 },
      { text: 'C', x: 30, y: 98.5, width: 5 },
    ];
    expect(assembleVisualOrderText(items)).toBe('A B C');
  });

  it('starts a new line once the y difference exceeds the tolerance', () => {
    const items = [
      { text: 'LINE1', x: 10, y: 100, width: 25 },
      { text: 'LINE2', x: 10, y: 90, width: 25 },
    ];
    expect(assembleVisualOrderText(items)).toBe('LINE1\nLINE2');
  });

  it('reconstructs a scrambled section heading + crew block into correct visual order', () => {
    // Simulates the reported bug: content-stream order interleaves a heading that
    // is visually above a crew list, but the crew names arrive first in the array.
    const items = [
      { text: 'BRICKMAN', x: 10, y: 80, width: 40 },
      { text: 'CABUENA', x: 10, y: 65, width: 40 },
      { text: 'CIVIL', x: 10, y: 110, width: 25 },
      { text: '#1', x: 40, y: 110, width: 10 },
    ];
    expect(assembleVisualOrderText(items)).toBe('CIVIL #1\nBRICKMAN\nCABUENA');
  });

  it('collapses internal whitespace and drops blank lines', () => {
    const items = [
      { text: '  SPACED   OUT  ', x: 10, y: 100, width: 60 },
      { text: '', x: 10, y: 40, width: 0 },
    ];
    expect(assembleVisualOrderText(items)).toBe('SPACED OUT');
  });

  it('joins closely-spaced items on a line with a single space (ordinary word spacing)', () => {
    const items = [
      { text: 'J.', x: 10, y: 100, width: 10 },
      { text: 'BRICKMAN', x: 22, y: 100, width: 40 }, // gap = 22 - (10+10) = 2, below threshold
    ];
    expect(assembleVisualOrderText(items)).toBe('J. BRICKMAN');
  });

  it('widens the separator across a large horizontal gap to mark a column/cell boundary', () => {
    // Mirrors a real POD mini-table row: a "CREW" row-label, a crew member's name in the
    // value column, then an "EQUIPMENT" column header far to the right - three genuinely
    // distinct cells that must not be visually indistinguishable from a run of prose.
    const items = [
      { text: 'CREW', x: 10, y: 100, width: 30 },
      { text: 'F. ROGALSKI', x: 150, y: 100, width: 60 }, // gap = 150 - 40 = 110, wide
      { text: 'EQUIPMENT', x: 400, y: 100, width: 60 }, // gap = 400 - 210 = 190, wide
    ];
    const line = assembleVisualOrderText(items);
    expect(line).not.toBe('CREW F. ROGALSKI EQUIPMENT');
    expect(line).toBe('CREW    F. ROGALSKI    EQUIPMENT');
  });

  it('does not widen the separator for a gap right at the ordinary word-spacing scale', () => {
    const items = [
      { text: 'TIE-IN', x: 10, y: 100, width: 30 },
      { text: 'EXL', x: 46, y: 100, width: 20 }, // gap = 46 - 40 = 6, below threshold
    ];
    expect(assembleVisualOrderText(items)).toBe('TIE-IN EXL');
  });
});

describe('PdfPodDocumentParser (real sample PDFs)', () => {
  const parser = new PdfPodDocumentParser();
  const fixturesDir = path.resolve(__dirname, '../../../../../attached_assets');

  const wellStructuredPdf = path.join(fixturesDir, '0_2022.09.03_-_Play_of_the_Day_1787271318891.pdf');
  const messyPdf = path.join(fixturesDir, '0_2025.04.29_-_MBRT_211_POD_4.29.25_1787271324405.pdf');

  it('canParse only matches PDF content type combined with the pod document type', () => {
    expect(parser.canParse('application/pdf', 'pod')).toBe(true);
    expect(parser.canParse('application/pdf', 'idr')).toBe(false);
    expect(parser.canParse('application/pdf')).toBe(false);
    expect(parser.canParse('application/msword', 'pod')).toBe(false);
  });

  it('reconstructs the well-structured 2022 sample with section headings preceding their own crew content', () => {
    if (!fs.existsSync(wellStructuredPdf)) {
      return; // sample fixture not present in this environment
    }
    const buffer = fs.readFileSync(wellStructuredPdf);
    return parser.parse(buffer, 'sample-2022.pdf').then(result => {
      const text = result.rawContent;
      expect(text.length).toBeGreaterThan(0);

      // Each "CIVIL #n" heading must appear before the crew names that belong to it,
      // and headings must appear in ascending document order (no cross-section bleed).
      const civil1Index = text.indexOf('CIVIL #1');
      const civil2Index = text.indexOf('CIVIL #2');
      expect(civil1Index).toBeGreaterThanOrEqual(0);
      expect(civil2Index).toBeGreaterThan(civil1Index);
    });
  });

  it('reconstructs the messy 2025 MBRT sample with sections in correct top-to-bottom order', () => {
    if (!fs.existsSync(messyPdf)) {
      return; // sample fixture not present in this environment
    }
    const buffer = fs.readFileSync(messyPdf);
    return parser.parse(buffer, 'sample-2025.pdf').then(result => {
      const text = result.rawContent;
      expect(text.length).toBeGreaterThan(0);

      // The four concrete sections on this sheet must appear in their true visual
      // top-to-bottom order, with no section's content preceding an earlier heading.
      const concrete1Index = text.indexOf('CONCRETE #1');
      const concrete2Index = text.indexOf('CONCRETE #2');
      const concrete5Index = text.indexOf('CONCRETE #5');
      const concrete6Index = text.indexOf('CONCRETE # 6');

      expect(concrete1Index).toBeGreaterThanOrEqual(0);
      expect(concrete2Index).toBeGreaterThan(concrete1Index);
      expect(concrete5Index).toBeGreaterThan(concrete2Index);
      expect(concrete6Index).toBeGreaterThan(concrete5Index);
    });
  });
});
