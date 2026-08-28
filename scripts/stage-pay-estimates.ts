/**
 * One-off staging script: parses all 57 SDOT "Progress Estimate" (pay estimate) documents
 * (Template C-20D "Progress Estimate Detail") into bid_item_progress_estimates.
 *
 * 56 of the 57 documents are PDFs (Adobe-Sign-encrypted, originally Excel exports). Text is
 * extracted with `pdftotext -layout`, which preserves column alignment well enough for these
 * fixed-width tables (unlike the HCSS Direct Cost Report, which needed pdfjs-dist coordinate
 * parsing -- that report's rows were far denser/more irregular than this one's clean per-item
 * table). One document (PE47) is an xlsx export instead; its item table lives on the "C@C"
 * sheet under different column headers (no previous-amount/this-period columns -- only
 * cumulative quantity-to-date/amount-to-date, which is what we store as canonical anyway).
 *
 * Item table columns (verified against printed row math, e.g. 1587.00 HR * $159.00 =
 * $252,333.00): Item No, Bid Code, Description, Contract (Taxable Estimate) Quantity, Units,
 * Unit Price, Quantity to Date, Percent Complete, Total Amount to Date, Previous Amount,
 * Quantity this Estimate, Amount Due this Estimate.
 *
 * Four early documents (PE05, PE06, PE08, PE13) use a visibly older item-table template instead
 * ("Template C-20L", a wide per-FCR quantity-tracking matrix rather than the later dollar-ledger
 * table) -- see parseOldFormatItems() below for that template's own coordinate-based parser.
 *
 * Validates each PE's summed item-level amounts against that PE's own printed
 * "Contract Bid Item Work" cover-sheet total (both cumulative and this-period figures).
 *
 * Not a general upload feature -- run manually against the known attached_assets directory.
 *
 * Usage: npx tsx scripts/stage-pay-estimates.ts <projectId>
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import XLSX from 'xlsx';
import * as pdfjsNamespace from 'pdfjs-dist/legacy/build/pdf.mjs';
const pdfjs: any = pdfjsNamespace;
import { db } from '../server/src/infrastructure/database';
import { delayAnalysisProjects, bidItemProgressEstimates, payEstimatePeriods } from '../shared/schema';
import { eq, asc } from 'drizzle-orm';

const PAY_ESTIMATES_DIR = 'attached_assets/pay_estimiates';

// This document returns zero usable item rows and is excluded from bid_item_progress_estimates
// entirely. It still gets a row in pay_estimate_periods with status='unrecoverable' and an
// explanatory note, so downstream features (e.g. Measured Mile) can tell users the period exists
// but its detail is missing, rather than silently having a gap.
//
// - PE33: rasterized/flattened PDF with no recoverable text layer at all (confirmed via both
//   pdftotext and pdfjs-dist -- fewer than 25 characters extractable across 48 pages). No OCR
//   is attempted: financial figures are too risky to guess at from OCR.
const UNRECOVERABLE_FILES = new Set(['2019-069_PE33_Fully signed_rev.pdf']);

// PE05, PE06, PE08, PE13: early-project documents whose item table is "Template C-20L", a wide
// per-Field-Change-Request (FCR) quantity matrix (Bid Item / Description / GRAND TOTAL / one
// column per FCR / PE #NN Total) rather than the later per-item dollar ledger -- no bid code,
// unit price, or dollar columns at all, just cumulative-to-date and this-period *quantities*.
// Parsed with pdfjs-dist coordinate extraction (see parseOldFormatItems) and priced against the
// bid-item catalog (bid code / unit price / contract quantity) recovered from this same
// project's other, standard-format PEs, since those are fixed contract terms that don't vary
// by period.
const OLD_FORMAT_FILES = new Set([
  '2019-069_PE05_Fully Signed.pdf',
  '2019-069_PE06_Fully Signed.pdf',
  '2019-069_PE08_Fully Signed.pdf',
  '2019-069_PE13_Fully Signed.pdf',
]);

interface ParsedItem {
  itemNo: number;
  bidCode: string;
  description: string;
  units: string | null;
  unitPrice: number | null;
  contractQuantity: number | null;
  quantityToDate: number | null;
  percentComplete: number | null;
  totalAmountToDate: number | null;
  previousAmount: number | null;
  quantityThisEstimate: number | null;
  amountDueThisEstimate: number | null;
}

interface ParsedPe {
  peNumber: number;
  cutoffDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  contractBidItemWorkToDate: number | null;
  contractBidItemWorkThisPeriod: number | null;
  items: ParsedItem[];
  sourceFile: string;
}

function parseNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  let s = raw.trim();
  if (s === '' || s === '-') return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,%]/g, '').trim();
  if (s === '' || s === '.') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

// Normalizes an M/D/YYYY or M/D/YY date string to ISO YYYY-MM-DD (2-digit years -> 20xx).
function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(raw.trim());
  if (!m) return null;
  const [, mm, dd, yyRaw] = m;
  const yyyy = yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

const NUMERIC_TOKEN_RE = /^\(?-?\$?[\d,]+\.?\d*\)?%?$/;

// Parses one "Progress Estimate Detail" data row, e.g.:
//   "8       110020   TRAFFIC CONTROL PEACE OFFICERS   12280   HR   $159.00   1587.00   12.92%   $252,333.00   $0.00   1587.00   $252,333.00"
// Trailing 9 tokens are fixed: contractQty, units, unitPrice, qtyToDate, pctComplete,
// totalAmtToDate, prevAmt, qtyThisEst, amtDueThisEst.
function parseDataLine(line: string): ParsedItem | null {
  const normalized = line.replace(/\$\s+/g, '$');
  const tokens = normalized.trim().split(/\s+/);
  if (tokens.length < 11) return null;
  if (!/^\d{1,4}$/.test(tokens[0])) return null;
  const code = tokens[1];
  if (!/^[0-9a-zA-Z]{3,10}$/.test(code)) return null;

  const trailing = tokens.slice(-9);
  const [contractQtyT, unitsT, unitPriceT, qtyToDateT, pctT, totalAmtT, prevAmtT, qtyThisT, amtDueT] = trailing;
  if (!NUMERIC_TOKEN_RE.test(contractQtyT)) return null;
  if (!/^[A-Za-z]{1,6}$/.test(unitsT)) return null;
  for (const t of [unitPriceT, qtyToDateT, pctT, totalAmtT, prevAmtT, qtyThisT, amtDueT]) {
    if (!NUMERIC_TOKEN_RE.test(t)) return null;
  }

  const descTokens = tokens.slice(2, tokens.length - 9);
  const description = descTokens.join(' ').trim();
  if (!description) return null;

  return {
    itemNo: parseInt(tokens[0], 10),
    bidCode: code,
    description,
    units: unitsT.toUpperCase(),
    unitPrice: parseNumber(unitPriceT),
    contractQuantity: parseNumber(contractQtyT),
    quantityToDate: parseNumber(qtyToDateT),
    percentComplete: parseNumber(pctT),
    totalAmountToDate: parseNumber(totalAmtT),
    previousAmount: parseNumber(prevAmtT),
    quantityThisEstimate: parseNumber(qtyThisT),
    amountDueThisEstimate: parseNumber(amtDueT),
  };
}

function peNumberFromFilename(filename: string): number {
  const m = /PE0*(\d+)/i.exec(filename);
  if (!m) throw new Error(`Cannot determine PE number from filename: ${filename}`);
  return parseInt(m[1], 10);
}

// Repairs a rare row-splitting artifact seen in some documents (e.g. PE14's Additive Bid
// section): pdftotext's -layout heuristic occasionally buckets a data row's own item-number+code
// prefix onto one output line (plus stray unrelated word(s), themselves leaked from an adjacent
// row's own split) while the row's description and all 9 trailing fields land on the very next,
// unprefixed, indented line. Detected narrowly (a short line starting with a valid item number
// that fails full parsing) and repaired by re-parsing itemNo+code+nextLine as one row -- the
// itemNo+code prefix check plus the strict full-row validation on the combined string mean this
// never fires on a normal single-line row, so it can't corrupt otherwise-good parses. The leaked
// word(s) on lineA are discarded rather than folded into the description: they belong to the
// previous row's own wrapped text, not this one (see the 3-line variant below), and keeping them
// out only costs description cosmetics, never the numeric fields validation actually checks.
function tryStitchedPair(lineA: string, lineB: string): ParsedItem | null {
  const tokensA = lineA.trim().split(/\s+/);
  if (tokensA.length < 2 || tokensA.length > 20) return null;
  if (!/^\d{1,4}$/.test(tokensA[0])) return null;
  const code = tokensA[1];
  if (!/^[0-9a-zA-Z]{3,10}$/.test(code)) return null;
  const tokensB = lineB.trim().split(/\s+/);
  if (tokensB.length === 0) return null;
  // Don't stitch onto a line that is already a complete, independent data row.
  if (/^\d{1,4}$/.test(tokensB[0]) && tokensB.length >= 11) return null;
  const combined = `${tokensA[0]} ${code} ${lineB.trim()}`;
  return parseDataLine(combined);
}

function tryStitchedTriple(lineA: string, lineB: string, lineC: string): ParsedItem | null {
  const tokensA = lineA.trim().split(/\s+/);
  if (tokensA.length < 2 || tokensA.length > 20) return null;
  if (!/^\d{1,4}$/.test(tokensA[0])) return null;
  const code = tokensA[1];
  if (!/^[0-9a-zA-Z]{3,10}$/.test(code)) return null;

  const tokensB = lineB.trim().split(/\s+/);
  if (tokensB.length === 0) return null;
  // Line B must be pure noise: no numeric-looking tokens (i.e. it can't itself be contributing
  // to a real row's trailing fields), and not the start of what could be another item's row.
  if (/^\d{1,4}$/.test(tokensB[0])) return null;
  if (tokensB.some((t) => NUMERIC_TOKEN_RE.test(t))) return null;

  const combined = `${tokensA[0]} ${code} ${lineC.trim()}`;
  return parseDataLine(combined);
}

// Fixed contract terms (bid code, unit, unit price, contract quantity) for one bid item, as
// recovered from this project's other, standard-format PEs. These never change period to period,
// which is what lets us price the old-format documents' quantity-only matrix (see
// parseOldFormatItems) even though that template never prints a dollar figure.
interface CatalogEntry {
  bidCode: string | null;
  description: string;
  units: string | null;
  unitPrice: number | null;
  contractQuantity: number | null;
}

// PE47 is the one xlsx-sourced period; its "C@C" sheet parse (see parseXlsxPe) has a handful of
// unit-price/contract-quantity mismatches against every PDF-sourced period for the same item
// (traced to that sheet's own column quirks, not a real contract revision), so it's excluded as a
// catalog source. Every other period, and PE1 in particular, covers all ~671 distinct item
// numbers across the whole 57-document series (confirmed via direct query), so the earliest
// available non-PE47 period per item is used as that item's canonical catalog entry.
async function buildItemCatalog(projectId: string): Promise<Map<number, CatalogEntry>> {
  const rows = await db
    .select()
    .from(bidItemProgressEstimates)
    .where(eq(bidItemProgressEstimates.projectId, projectId))
    .orderBy(asc(bidItemProgressEstimates.peNumber));

  const catalog = new Map<number, CatalogEntry>();
  for (const row of rows) {
    if (row.peNumber === 47) continue;
    if (row.itemNo === null) continue;
    if (catalog.has(row.itemNo)) continue; // rows are in ascending peNumber order; keep the first
    catalog.set(row.itemNo, {
      bidCode: row.bidCode,
      description: row.description ?? '',
      units: row.units,
      unitPrice: row.unitPrice !== null ? Number(row.unitPrice) : null,
      contractQuantity: row.contractQuantity !== null ? Number(row.contractQuantity) : null,
    });
  }
  return catalog;
}

interface OldFormatToken {
  x: number;
  y: number;
  str: string;
}

interface OldFormatPageAnchors {
  grandX: number;
  peX: number;
  fcrXs: number[];
}

interface OldFormatPage {
  anchors: OldFormatPageAnchors;
  rows: { y: number; tokens: OldFormatToken[] }[];
}

// A "Template C-20L" header row is one whose tokens are entirely made up of known column labels
// (the "GRAND"/"TOTAL"/"PE #NN"/"Total"/"FCR #NNN" quantity-matrix headers, the "Bid Item" /
// "Description" item-table headers, or the cover-block furniture printed above the table) --
// never real item data, even on continuation pages where it reprints without a "Base Bid" marker.
function isOldFormatHeaderRow(tokens: OldFormatToken[]): boolean {
  const rowText = tokens.map((t) => t.str).join(' ');
  if (/^(Project:|Contractor|PW #|Fed Aid #:|All Funding Sources)/.test(rowText)) return true;
  if (/^Bid Item|^Description$/.test(rowText)) return true;
  return tokens.every(
    (t) => t.str === 'GRAND' || t.str === 'TOTAL' || t.str === 'Total' || /^PE #\d+$/.test(t.str) || /^FCR/.test(t.str),
  );
}

// Extracts, per page, the "Bid Item Tracking" quantity-matrix pages (identified by having both a
// "GRAND"(TOTAL) column and a "Bid Item"/"Add BI#" item column -- present on every matrix page,
// including continuations) along with that page's own column x-anchors. Anchors are recomputed
// per page rather than once per document because the number of FCR (Field Change Request) columns
// between the two quantity columns varies page to page, shifting the right-hand "PE #NN Total"
// column's x-position along with it.
async function extractOldFormatPages(filePath: string): Promise<OldFormatPage[]> {
  const doc = await pdfjs.getDocument({ url: filePath, useSystemFonts: true }).promise;
  const pages: OldFormatPage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: OldFormatToken[] = (content.items as any[])
      .map((it) => ({ x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), str: String(it.str) }))
      .filter((it) => it.str.trim());
    const fullText = items.map((it) => it.str).join(' ');
    if (!/GRAND/.test(fullText) || !/Bid Item|Add BI#/.test(fullText)) continue;

    const byY = new Map<number, OldFormatToken[]>();
    for (const it of items) {
      if (!byY.has(it.y)) byY.set(it.y, []);
      byY.get(it.y)!.push(it);
    }
    const rows = Array.from(byY.entries())
      .map(([y, tokens]) => ({ y, tokens: tokens.sort((a, b) => a.x - b.x) }))
      .sort((a, b) => b.y - a.y);

    let grandX: number | null = null;
    let peX: number | null = null;
    const fcrXs: number[] = [];
    for (const row of rows) {
      for (const t of row.tokens) {
        if ((t.str === 'GRAND' || t.str === 'TOTAL') && grandX === null) grandX = t.x;
        if (/^PE #\d+$/.test(t.str)) peX = t.x;
        if (t.str === 'Total' && peX !== null && Math.abs(t.x - peX) < 15) peX = t.x;
        if (/^FCR/.test(t.str)) fcrXs.push(t.x);
      }
    }
    if (grandX === null || peX === null) continue; // header not found on this page; skip defensively
    pages.push({ anchors: { grandX, peX, fcrXs }, rows });
  }
  return pages;
}

// Parses the Template C-20L quantity matrix into per-item cumulative-to-date and this-period
// quantities. Only Base Bid + Additive Bid items are included (matching the standard-format
// parser's own "Contract Bid Item Work" scope) -- reading stops the moment a Change Order ("CO
// #N") section starts, since those are reported separately and would double-count against the
// cover-sheet total this is validated against.
//
// An item's row can wrap across multiple physical text lines (long descriptions), and its GRAND
// TOTAL / PE #NN Total values can land on a different physical line than its item-number line --
// so rows are accumulated per item (from its item-number line up to, but not including, the next
// item's) rather than parsed one line at a time. Each numeric token is assigned to the nearest of
// that page's known column anchors (GRAND TOTAL, PE #NN Total, or one of the FCR columns in
// between); FCR-column values are per-field-change-request deltas, not needed here, and are
// discarded once classified.
function parseOldFormatItemRows(pages: OldFormatPage[]): { itemNo: number; description: string; quantityToDate: number | null; quantityThisEstimate: number | null }[] {
  const items: { itemNo: number; description: string; quantityToDate: number | null; quantityThisEstimate: number | null }[] = [];
  let current: { itemNo: number; descParts: string[]; grand: number | null; pe: number | null } | null = null;
  let active = false;
  let stopped = false;

  const finalize = () => {
    if (current) {
      items.push({
        itemNo: current.itemNo,
        description: current.descParts.join(' ').replace(/\s+/g, ' ').trim(),
        quantityToDate: current.grand,
        quantityThisEstimate: current.pe,
      });
      current = null;
    }
  };

  for (const page of pages) {
    if (stopped) break;
    const columnAnchors: { key: 'grand' | 'pe' | 'fcr'; x: number }[] = [
      { key: 'grand', x: page.anchors.grandX },
      { key: 'pe', x: page.anchors.peX },
      ...page.anchors.fcrXs.map((x) => ({ key: 'fcr' as const, x })),
    ];
    const classify = (x: number): 'grand' | 'pe' | 'fcr' => {
      let best = columnAnchors[0];
      let bestDist = Math.abs(x - best.x);
      for (const a of columnAnchors.slice(1)) {
        const d = Math.abs(x - a.x);
        if (d < bestDist) {
          best = a;
          bestDist = d;
        }
      }
      return best.key;
    };

    for (const row of page.rows) {
      if (isOldFormatHeaderRow(row.tokens)) continue;
      const rowText = row.tokens.map((t) => t.str).join(' ');
      if (/^CO #\d/.test(rowText)) {
        stopped = true;
        break;
      }
      if (rowText === 'Base Bid' || /^Add BI#/.test(rowText)) {
        active = true;
        continue;
      }
      if (!active) continue;

      const tokens = row.tokens;
      const firstTok = tokens[0];
      const startsNewItem = /^\d{1,4}$/.test(firstTok.str) && firstTok.x < 32;
      if (startsNewItem) {
        finalize();
        current = { itemNo: parseInt(firstTok.str, 10), descParts: [], grand: null, pe: null };
      }
      if (!current) continue; // stray furniture row before any item has started

      for (let i = startsNewItem ? 1 : 0; i < tokens.length; i++) {
        const t = tokens[i];
        const num = parseNumber(t.str);
        if (num === null) {
          current.descParts.push(t.str);
        } else {
          const bucket = classify(t.x);
          if (bucket === 'grand') current.grand = num;
          else if (bucket === 'pe') current.pe = num;
        }
      }
    }
  }
  finalize();
  return items;
}

// Prices the Template C-20L quantity matrix's raw itemNo/quantity rows against this project's
// bid-item catalog (see buildItemCatalog): quantities are printed in this template, but bid code,
// unit price, units, and contract quantity are not, so they're carried over from the item's fixed
// contract terms elsewhere in the series. An item absent from the catalog (shouldn't happen -- see
// buildItemCatalog's coverage note) is kept with null priced fields rather than dropped, so a gap
// stays visible in validation instead of silently under-counting the period's total.
function priceOldFormatItems(
  rawItems: { itemNo: number; description: string; quantityToDate: number | null; quantityThisEstimate: number | null }[],
  catalog: Map<number, CatalogEntry>,
): ParsedItem[] {
  return rawItems.map((raw) => {
    const cat = catalog.get(raw.itemNo);
    const unitPrice = cat?.unitPrice ?? null;
    const contractQuantity = cat?.contractQuantity ?? null;
    const quantityToDate = raw.quantityToDate;
    const quantityThisEstimate = raw.quantityThisEstimate;
    const totalAmountToDate = quantityToDate !== null && unitPrice !== null ? quantityToDate * unitPrice : null;
    const amountDueThisEstimate =
      quantityThisEstimate !== null && unitPrice !== null ? quantityThisEstimate * unitPrice : null;
    const previousAmount =
      totalAmountToDate !== null && amountDueThisEstimate !== null ? totalAmountToDate - amountDueThisEstimate : null;
    const percentComplete =
      quantityToDate !== null && contractQuantity !== null && contractQuantity !== 0
        ? (quantityToDate / contractQuantity) * 100
        : null;
    return {
      itemNo: raw.itemNo,
      bidCode: cat?.bidCode ?? '',
      description: cat?.description || raw.description,
      units: cat?.units ?? null,
      unitPrice,
      contractQuantity,
      quantityToDate,
      percentComplete,
      totalAmountToDate,
      previousAmount,
      quantityThisEstimate,
      amountDueThisEstimate,
    };
  });
}

async function parseOldFormatItems(filePath: string, catalog: Map<number, CatalogEntry>): Promise<ParsedItem[]> {
  const pages = await extractOldFormatPages(filePath);
  const rawItems = parseOldFormatItemRows(pages);
  return priceOldFormatItems(rawItems, catalog);
}

async function parsePdfPe(filePath: string, catalog: Map<number, CatalogEntry>): Promise<ParsedPe> {
  const text = execFileSync('pdftotext', ['-layout', filePath, '-'], {
    maxBuffer: 1024 * 1024 * 200,
    encoding: 'utf8',
  });

  const cutoffMatch = /Cutoff Date:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/.exec(text);
  const periodMatch = /Pay Period:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+to\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/.exec(text);
  const peNumMatch = /Progress Estimate #:\s*(\d+)/.exec(text);

  // "Contract Bid Item Work" is the cover-sheet label for Base Bid + Additive Bid only (Change
  // Order Work is reported separately and is out of scope -- see the Change Orders exclusion
  // below). The final estimate in this series (PE57) drops the cover-sheet summary entirely, so
  // fall back to the item table's own "SUBTOTAL: Base Bid + Additive Bid" line in that case.
  let bidItemWorkMatch = /Contract Bid Item Work\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})/.exec(
    text,
  );
  if (!bidItemWorkMatch) {
    bidItemWorkMatch =
      /SUBTOTAL:\s*Base Bid \+ Additive Bid\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})\s+\$?([\d,]+\.\d{2})/.exec(text);
  }

  const filename = path.basename(filePath);
  let items: ParsedItem[];
  if (OLD_FORMAT_FILES.has(filename)) {
    items = await parseOldFormatItems(filePath, catalog);
  } else if (UNRECOVERABLE_FILES.has(filename)) {
    items = [];
  } else {
    const itemsByKey = new Map<string, ParsedItem>();
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      // "Contract Bid Item Work" (Base + Additive) excludes Change Orders entirely, which are
      // reported as a separate schedule further down the same document with their own item rows
      // (often reusing the original items' numbers/codes for quantity revisions) -- including
      // them would double-count against the validation total above.
      if (/^Change Orders(\s|$)/.test(lines[i])) break;

      let parsed = parseDataLine(lines[i]);
      let linesConsumed = 0;
      if (!parsed && i + 1 < lines.length) {
        parsed = tryStitchedPair(lines[i], lines[i + 1]);
        if (parsed) linesConsumed = 1;
      }
      if (!parsed && i + 2 < lines.length) {
        parsed = tryStitchedTriple(lines[i], lines[i + 1], lines[i + 2]);
        if (parsed) linesConsumed = 2;
      }
      if (parsed) {
        // Same item can appear once per printed page (header/footer reprints, not real
        // duplicates) only if content is identical; keep the first.
        const key = `${parsed.itemNo}:${parsed.bidCode}`;
        if (!itemsByKey.has(key)) itemsByKey.set(key, parsed);
        i += linesConsumed;
      }
    }
    items = Array.from(itemsByKey.values());
  }

  return {
    peNumber: peNumMatch ? parseInt(peNumMatch[1], 10) : peNumberFromFilename(filename),
    cutoffDate: normalizeDate(cutoffMatch?.[1]),
    periodStart: normalizeDate(periodMatch?.[1]),
    periodEnd: normalizeDate(periodMatch?.[2]),
    contractBidItemWorkToDate: bidItemWorkMatch ? parseNumber(bidItemWorkMatch[1]) : null,
    contractBidItemWorkThisPeriod: bidItemWorkMatch ? parseNumber(bidItemWorkMatch[3]) : null,
    items,
    sourceFile: filePath,
  };
}

function parseXlsxPe(filePath: string): ParsedPe {
  const wb = XLSX.readFile(filePath);
  const filename = path.basename(filePath);

  const summarySheet = wb.Sheets['Summary'];
  const summaryRows: any[][] = summarySheet
    ? XLSX.utils.sheet_to_json(summarySheet, { header: 1, raw: false, defval: '' })
    : [];
  let cutoffDate: string | null = null;
  let peNumberFromSheet: number | null = null;
  for (const row of summaryRows) {
    for (let i = 0; i < row.length; i++) {
      if (String(row[i]).trim() === 'Cutoff Date:') cutoffDate = normalizeDate(String(row[i + 1] ?? ''));
      if (String(row[i]).trim() === 'Progress Estimate #:') peNumberFromSheet = parseInt(String(row[i + 1] ?? ''), 10) || null;
    }
  }

  const finalSheet = wb.Sheets['Final'];
  const finalRows: any[][] = finalSheet
    ? XLSX.utils.sheet_to_json(finalSheet, { header: 1, raw: false, defval: '' })
    : [];
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let bidItemWorkToDate: number | null = null;
  let bidItemWorkThisPeriod: number | null = null;
  for (let r = 0; r < finalRows.length; r++) {
    const row = finalRows[r];
    if (String(row[0]).trim() === 'Pay Period:') {
      periodStart = normalizeDate(String(row[1] ?? ''));
      const toIdx = row.findIndex((c, i) => i > 1 && String(c).trim().toLowerCase() === 'to');
      if (toIdx >= 0) periodEnd = normalizeDate(String(row[toIdx + 1] ?? ''));
    }
    if (String(row[0]).trim() === 'Contract Bid Item Work') {
      const nums = row.map((c) => parseNumber(String(c))).filter((n): n is number => n !== null);
      if (nums.length >= 1) bidItemWorkToDate = nums[0];
      if (nums.length >= 3) bidItemWorkThisPeriod = nums[2];
    }
  }

  const ccSheet = wb.Sheets['C@C'];
  const ccRows: any[][] = ccSheet
    ? XLSX.utils.sheet_to_json(ccSheet, { header: 1, raw: false, defval: '' })
    : [];
  let headerRowIdx = ccRows.findIndex((row) => String(row[0]).trim() === 'Item No.');
  const items: ParsedItem[] = [];
  if (headerRowIdx >= 0) {
    for (let r = headerRowIdx + 1; r < ccRows.length; r++) {
      const row = ccRows[r];
      // Mirrors the PDF path's "Change Orders" cutoff: this sheet has its own "Change Orders"
      // section further down, whose rows reuse the original bid items' numbers for quantity
      // revisions -- without stopping here those would double-count against the "Contract Bid
      // Item Work" (Base + Additive Bid only) validation total, same as in the PDF documents.
      if (String(row[0]).trim() === 'Change Orders') break;
      const itemNoRaw = String(row[0] ?? '').trim();
      if (!/^\d{1,4}$/.test(itemNoRaw)) continue; // section headers ("Base Bid", etc.) or blanks
      const description = String(row[2] ?? '').trim();
      if (!description) continue;
      items.push({
        itemNo: parseInt(itemNoRaw, 10),
        bidCode: '', // not present in this sheet's columns
        description,
        units: String(row[5] ?? '').trim() || null,
        unitPrice: parseNumber(String(row[6] ?? '')),
        contractQuantity: parseNumber(String(row[4] ?? '')),
        quantityToDate: parseNumber(String(row[7] ?? '')),
        percentComplete: parseNumber(String(row[8] ?? '')),
        totalAmountToDate: parseNumber(String(row[9] ?? '')),
        previousAmount: null,
        quantityThisEstimate: null,
        amountDueThisEstimate: null,
      });
    }
  }

  return {
    peNumber: peNumberFromSheet ?? peNumberFromFilename(filename),
    cutoffDate,
    periodStart,
    periodEnd,
    contractBidItemWorkToDate: bidItemWorkToDate,
    contractBidItemWorkThisPeriod: bidItemWorkThisPeriod,
    items,
    sourceFile: filePath,
  };
}

async function parsePe(filePath: string, catalog: Map<number, CatalogEntry>): Promise<ParsedPe> {
  return filePath.toLowerCase().endsWith('.xlsx') ? parseXlsxPe(filePath) : await parsePdfPe(filePath, catalog);
}

async function stagePayEstimates(projectId: string, dryRun: boolean) {
  const files = fs
    .readdirSync(PAY_ESTIMATES_DIR)
    .filter((f) => /\.(pdf|xlsx)$/i.test(f))
    .map((f) => path.join(PAY_ESTIMATES_DIR, f));

  if (files.length === 0) {
    throw new Error(`No pay estimate files found in ${PAY_ESTIMATES_DIR}`);
  }

  // The old-format documents (see OLD_FORMAT_FILES) need a bid-item catalog -- built from this
  // project's already-staged, standard-format PEs -- to price their quantity-only matrix. Built
  // from the database's current state, before this run's delete+reinsert below, so it reflects
  // the last successful staging run regardless of file processing order.
  const catalog = await buildItemCatalog(projectId);

  const parsedPes: ParsedPe[] = [];
  for (const file of files) {
    process.stdout.write(`Parsing ${path.basename(file)}... `);
    const parsed = await parsePe(file, catalog);
    parsedPes.push(parsed);

    const summedToDate = parsed.items.reduce((s, i) => s + (i.totalAmountToDate ?? 0), 0);
    const summedThisPeriod = parsed.items.reduce((s, i) => s + (i.amountDueThisEstimate ?? 0), 0);
    const toDateDelta = parsed.contractBidItemWorkToDate !== null ? Math.abs(summedToDate - parsed.contractBidItemWorkToDate) : null;
    const thisPeriodDelta = parsed.contractBidItemWorkThisPeriod !== null ? Math.abs(summedThisPeriod - parsed.contractBidItemWorkThisPeriod) : null;
    console.log(
      `PE#${parsed.peNumber} items=${parsed.items.length} cutoff=${parsed.cutoffDate} ` +
        `toDateSum=$${summedToDate.toFixed(2)} (printed $${parsed.contractBidItemWorkToDate?.toFixed(2) ?? 'n/a'}, delta=${toDateDelta?.toFixed(2) ?? 'n/a'}) ` +
        `thisPeriodSum=$${summedThisPeriod.toFixed(2)} (printed $${parsed.contractBidItemWorkThisPeriod?.toFixed(2) ?? 'n/a'}, delta=${thisPeriodDelta?.toFixed(2) ?? 'n/a'})`
    );
  }

  const seenPeNumbers = new Set<number>();
  for (const pe of parsedPes) {
    if (seenPeNumbers.has(pe.peNumber)) {
      console.warn(`WARNING: duplicate PE number ${pe.peNumber} (source: ${pe.sourceFile})`);
    }
    seenPeNumbers.add(pe.peNumber);
  }
  for (let n = 1; n <= 57; n++) {
    if (!seenPeNumbers.has(n)) console.warn(`WARNING: missing PE number ${n}`);
  }

  const toStr = (n: number | null) => (n !== null ? String(n) : null);

  type PeriodStatus = 'exact' | 'minor_discrepancy' | 'significant_discrepancy' | 'unvalidated' | 'unrecoverable';
  const periodRows: (typeof payEstimatePeriods.$inferInsert)[] = [];
  const statusCounts: Record<PeriodStatus, number> = {
    exact: 0,
    minor_discrepancy: 0,
    significant_discrepancy: 0,
    unvalidated: 0,
    unrecoverable: 0,
  };

  for (const pe of parsedPes) {
    const summedToDate = pe.items.reduce((s, i) => s + (i.totalAmountToDate ?? 0), 0);
    const filename = path.basename(pe.sourceFile);
    let status: PeriodStatus;
    let notes: string | null = null;
    let delta: number | null = null;
    let deltaPct: number | null = null;

    if (UNRECOVERABLE_FILES.has(filename)) {
      status = 'unrecoverable';
      notes = 'Rasterized/flattened PDF with no recoverable text layer; item detail could not be extracted.';
    } else if (pe.contractBidItemWorkToDate === null) {
      status = 'unvalidated';
      notes = 'No printed cover-sheet total found in this document to validate against.';
    } else {
      delta = Math.abs(summedToDate - pe.contractBidItemWorkToDate);
      deltaPct = pe.contractBidItemWorkToDate !== 0 ? (delta / pe.contractBidItemWorkToDate) * 100 : null;
      if (delta < 1) {
        status = 'exact';
      } else if (deltaPct !== null && deltaPct <= 3.5) {
        status = 'minor_discrepancy';
        const likelyCause = OLD_FORMAT_FILES.has(filename)
          ? "likely due to this document's older item-table layout, where dollar figures are derived from quantities read off a separate matrix and priced against this project's other periods' bid-item catalog rather than printed directly"
          : 'likely due to a small number of items with descriptions that wrap unpredictably across lines in the source PDF';
        notes = `Summed item total is off from the printed cover-sheet total by $${delta.toFixed(2)} (${deltaPct.toFixed(2)}%), ${likelyCause}.`;
      } else {
        status = 'significant_discrepancy';
        notes = `Summed item total is off from the printed cover-sheet total by $${delta.toFixed(2)} (${deltaPct !== null ? deltaPct.toFixed(2) + '%' : 'n/a'}).`;
      }
    }
    statusCounts[status]++;

    periodRows.push({
      projectId,
      peNumber: pe.peNumber,
      sourceFile: pe.sourceFile,
      cutoffDate: pe.cutoffDate,
      periodStart: pe.periodStart,
      periodEnd: pe.periodEnd,
      itemCount: pe.items.length,
      printedToDateTotal: toStr(pe.contractBidItemWorkToDate),
      summedToDateTotal: toStr(pe.items.length > 0 ? summedToDate : null),
      toDateDelta: toStr(delta),
      toDateDeltaPct: toStr(deltaPct),
      status,
      notes,
    });
  }

  console.log(
    `\nValidation summary: ${statusCounts.exact} exact, ${statusCounts.minor_discrepancy} minor discrepancy (<=3.5%), ` +
      `${statusCounts.significant_discrepancy} significant discrepancy (>3.5%), ${statusCounts.unvalidated} unvalidated (no printed total), ` +
      `${statusCounts.unrecoverable} unrecoverable (skipped) out of ${parsedPes.length}.`,
  );

  if (dryRun) {
    console.log('\nDry run: no database changes made.');
    return { inserted: 0, peCount: parsedPes.length };
  }

  const inserts: (typeof bidItemProgressEstimates.$inferInsert)[] = [];
  for (const pe of parsedPes) {
    for (const item of pe.items) {
      inserts.push({
        projectId,
        peNumber: pe.peNumber,
        cutoffDate: pe.cutoffDate,
        periodStart: pe.periodStart,
        periodEnd: pe.periodEnd,
        itemNo: item.itemNo,
        bidCode: item.bidCode || null,
        description: item.description,
        units: item.units,
        unitPrice: toStr(item.unitPrice),
        contractQuantity: toStr(item.contractQuantity),
        quantityToDate: toStr(item.quantityToDate),
        percentComplete: toStr(item.percentComplete),
        totalAmountToDate: toStr(item.totalAmountToDate),
        previousAmount: toStr(item.previousAmount),
        quantityThisEstimate: toStr(item.quantityThisEstimate),
        amountDueThisEstimate: toStr(item.amountDueThisEstimate),
        sourceFile: pe.sourceFile,
      });
    }
  }

  await db.delete(bidItemProgressEstimates).where(eq(bidItemProgressEstimates.projectId, projectId));
  await db.delete(payEstimatePeriods).where(eq(payEstimatePeriods.projectId, projectId));
  for (let i = 0; i < inserts.length; i += 200) {
    await db.insert(bidItemProgressEstimates).values(inserts.slice(i, i + 200));
  }
  for (let i = 0; i < periodRows.length; i += 200) {
    await db.insert(payEstimatePeriods).values(periodRows.slice(i, i + 200));
  }

  console.log(`\nInserted ${inserts.length} item rows and ${periodRows.length} period records across ${parsedPes.length} pay estimates.`);
  return { inserted: inserts.length, peCount: parsedPes.length };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const projectId = args.find((a) => !a.startsWith('--'));
  if (!projectId) {
    console.error('Usage: npx tsx scripts/stage-pay-estimates.ts <projectId> [--dry-run]');
    process.exit(1);
  }
  const [project] = await db.select().from(delayAnalysisProjects).where(eq(delayAnalysisProjects.id, projectId));
  if (!project) {
    console.error(`No delay_analysis_projects row found for id ${projectId}`);
    process.exit(1);
  }
  console.log(`${dryRun ? '[DRY RUN] ' : ''}Staging into project: ${project.name} (${project.id})`);

  await stagePayEstimates(projectId, dryRun);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
