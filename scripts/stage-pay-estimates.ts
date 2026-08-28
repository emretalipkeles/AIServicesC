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
import { db } from '../server/src/infrastructure/database';
import { delayAnalysisProjects, bidItemProgressEstimates } from '../shared/schema';
import { eq } from 'drizzle-orm';

const PAY_ESTIMATES_DIR = 'attached_assets/pay_estimiates';

// One document (PE33) is a rasterized/flattened PDF with no recoverable text layer at all
// (confirmed via both pdftotext and pdfjs-dist -- fewer than 25 characters extractable across
// the whole 48-page file). No OCR is attempted: financial figures are too risky to guess at
// from OCR. This period's item-level detail is simply absent from the staged time series;
// PE32 and PE34 still bound it on either side.
const UNRECOVERABLE_FILES = new Set(['2019-069_PE33_Fully signed_rev.pdf']);

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
// prefix onto one output line (plus a stray unrelated token, itself leaked from an adjacent row's
// own split) while the row's description and all 9 trailing fields land on the very next,
// unprefixed, indented line. Detected narrowly (a short 2-4 token line starting with a valid item
// number that fails full parsing) and repaired by re-parsing itemNo+code+nextLine as one row --
// this never fires on a normal single-line row, so it can't corrupt otherwise-good parses.
function tryStitchedPair(lineA: string, lineB: string): ParsedItem | null {
  const tokensA = lineA.trim().split(/\s+/);
  if (tokensA.length < 2 || tokensA.length > 4) return null;
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

function parsePdfPe(filePath: string): ParsedPe {
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
  const itemsByKey = new Map<string, ParsedItem>();
  if (!UNRECOVERABLE_FILES.has(filename)) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      // "Contract Bid Item Work" (Base + Additive) excludes Change Orders entirely, which are
      // reported as a separate schedule further down the same document with their own item rows
      // (often reusing the original items' numbers/codes for quantity revisions) -- including
      // them would double-count against the validation total above.
      if (/^Change Orders(\s|$)/.test(lines[i])) break;

      let parsed = parseDataLine(lines[i]);
      let consumedNext = false;
      if (!parsed && i + 1 < lines.length) {
        parsed = tryStitchedPair(lines[i], lines[i + 1]);
        if (parsed) consumedNext = true;
      }
      if (parsed) {
        // Same item can appear once per printed page (header/footer reprints, not real
        // duplicates) only if content is identical; keep the first.
        const key = `${parsed.itemNo}:${parsed.bidCode}`;
        if (!itemsByKey.has(key)) itemsByKey.set(key, parsed);
        if (consumedNext) i++;
      }
    }
  }

  return {
    peNumber: peNumMatch ? parseInt(peNumMatch[1], 10) : peNumberFromFilename(filename),
    cutoffDate: normalizeDate(cutoffMatch?.[1]),
    periodStart: normalizeDate(periodMatch?.[1]),
    periodEnd: normalizeDate(periodMatch?.[2]),
    contractBidItemWorkToDate: bidItemWorkMatch ? parseNumber(bidItemWorkMatch[1]) : null,
    contractBidItemWorkThisPeriod: bidItemWorkMatch ? parseNumber(bidItemWorkMatch[3]) : null,
    items: Array.from(itemsByKey.values()),
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

async function parsePe(filePath: string): Promise<ParsedPe> {
  return filePath.toLowerCase().endsWith('.xlsx') ? parseXlsxPe(filePath) : await parsePdfPe(filePath);
}

async function stagePayEstimates(projectId: string, dryRun: boolean) {
  const files = fs
    .readdirSync(PAY_ESTIMATES_DIR)
    .filter((f) => /\.(pdf|xlsx)$/i.test(f))
    .map((f) => path.join(PAY_ESTIMATES_DIR, f));

  if (files.length === 0) {
    throw new Error(`No pay estimate files found in ${PAY_ESTIMATES_DIR}`);
  }

  const parsedPes: ParsedPe[] = [];
  for (const file of files) {
    process.stdout.write(`Parsing ${path.basename(file)}... `);
    const parsed = await parsePe(file);
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

  const exact = parsedPes.filter((pe) => {
    const s = pe.items.reduce((s2, i) => s2 + (i.totalAmountToDate ?? 0), 0);
    return pe.contractBidItemWorkToDate !== null && Math.abs(s - pe.contractBidItemWorkToDate) < 1;
  }).length;
  const noValidationTotal = parsedPes.filter((pe) => pe.contractBidItemWorkToDate === null).length;
  const mismatched = parsedPes.length - exact - noValidationTotal;
  console.log(
    `\nValidation summary: ${exact}/${parsedPes.length} match printed totals exactly (<$1), ` +
      `${mismatched} have a discrepancy, ${noValidationTotal} have no printed total to check against.`,
  );

  if (dryRun) {
    console.log('\nDry run: no database changes made.');
    return { inserted: 0, peCount: parsedPes.length };
  }

  const toStr = (n: number | null) => (n !== null ? String(n) : null);
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
  for (let i = 0; i < inserts.length; i += 200) {
    await db.insert(bidItemProgressEstimates).values(inserts.slice(i, i + 200));
  }

  console.log(`\nInserted ${inserts.length} rows across ${parsedPes.length} pay estimates.`);
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
