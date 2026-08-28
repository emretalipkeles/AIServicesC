/**
 * One-off staging script: re-parses the contractor's HeavyBid "Direct Cost Report" (HCSS) from
 * its PDF export (not the xlsx export -- see scripts/stage-bid-cost-data.ts for that attempt and
 * why it under-recovered ~42% of the report's own grand total).
 *
 * The PDF's text stream carries real per-character x/y coordinates. Because the report's column
 * headers sit at fixed x positions on every page (verified across pages 1, 50, 100, 150, 189),
 * each numeric token can be assigned to its true column via nearest-anchor matching instead of
 * guessing from merged/scrambled spreadsheet cells. This recovers the full labor/material/
 * matl-exp/equipment/subcontract cost breakdown per resource line, not just a single lineTotal.
 *
 * Replaces (does not append to) any existing bid_item_cost_estimate_lines rows for the project --
 * this supersedes the xlsx-derived staging of the same underlying report.
 *
 * Not a general upload feature -- run manually against the one known attached_assets PDF.
 *
 * Usage: npx tsx scripts/stage-bid-cost-data-pdf.ts <projectId>
 */
import * as pdfjsNamespace from 'pdfjs-dist/legacy/build/pdf.mjs';
const pdfjs: any = pdfjsNamespace;
import { db } from '../server/src/infrastructure/database';
import { delayAnalysisProjects, bidItemCostEstimateLines } from '../shared/schema';
import { eq } from 'drizzle-orm';

const COST_REPORT_PDF = 'attached_assets/Madison_Direct_Cost_Report_HCSS_1787930438746.pdf';

// Column anchors in PDF points, read directly off the report's fixed two-row header
// ("Activity Desc ... / Resource Pcs Quantity Unit Cost Labor Material Matl/Exp Ment Contract Total"),
// confirmed identical across pages 1, 50, 100, 150, and 189.
const ANCHORS = {
  pcs: 194,
  unitCost: 320,
  labor: 359,
  material: 384,
  matlExp: 417,
  equipment: 465,
  subcontract: 488,
  total: 529,
};

const BUCKET_ANCHORS: { key: 'laborCost' | 'materialCost' | 'matlExpCost' | 'equipmentCost' | 'subcontractCost' | 'lineTotal'; x: number }[] = [
  { key: 'laborCost', x: ANCHORS.labor },
  { key: 'materialCost', x: ANCHORS.material },
  { key: 'matlExpCost', x: ANCHORS.matlExp },
  { key: 'equipmentCost', x: ANCHORS.equipment },
  { key: 'subcontractCost', x: ANCHORS.subcontract },
  { key: 'lineTotal', x: ANCHORS.total },
];

function nearestBucket(x: number) {
  let best = BUCKET_ANCHORS[0];
  let bestDist = Math.abs(x - best.x);
  for (const a of BUCKET_ANCHORS.slice(1)) {
    const d = Math.abs(x - a.x);
    if (d < bestDist) {
      best = a;
      bestDist = d;
    }
  }
  return best.key;
}

function parseNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = raw.replace(/[,$\[\]]/g, '').trim();
  if (cleaned === '' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

interface RawToken {
  x: number;
  str: string;
}

interface Row {
  page: number;
  y: number;
  tokens: RawToken[];
  text: string;
}

async function extractRows(): Promise<Row[]> {
  const doc = await pdfjs.getDocument({ url: COST_REPORT_PDF, useSystemFonts: true }).promise;
  const rows: Row[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const byY = new Map<number, RawToken[]>();
    for (const it of content.items as any[]) {
      const str = String(it.str);
      if (!str.trim()) continue;
      const y = Math.round(it.transform[5]);
      if (y >= 679) continue; // page furniture: company/title/two-row column header
      const x0 = it.transform[4];
      const width = it.width || 0;
      // split items that bundle multiple whitespace-separated numbers (rare, but the PDF
      // occasionally lays two adjacent column values into one text run), estimating each
      // sub-token's x proportionally by character offset.
      const parts = str.split(/(\s+)/);
      let charOffset = 0;
      const charWidth = str.length > 0 ? width / str.length : 0;
      for (const part of parts) {
        if (part.trim()) {
          const tokenX = x0 + charOffset * charWidth;
          if (!byY.has(y)) byY.set(y, []);
          byY.get(y)!.push({ x: Math.round(tokenX), str: part });
        }
        charOffset += part.length;
      }
    }
    for (const [y, tokens] of byY) {
      tokens.sort((a, b) => a.x - b.x);
      rows.push({ page: p, y, tokens, text: tokens.map((t) => t.str).join(' ') });
    }
  }
  // reading order: page ascending, then y descending (PDF y increases upward)
  rows.sort((a, b) => (a.page !== b.page ? a.page - b.page : b.y - a.y));
  return rows;
}

type LineKind =
  | 'bid_item_header'
  | 'sub_activity_header'
  | 'resource_line'
  | 'sub_activity_total'
  | 'bid_item_total'
  | 'report_footer'
  | 'other';

interface ParsedLine {
  bidItemNo: number | null;
  bidItemDescription: string | null;
  subActivityCode: string | null;
  subActivityDescription: string | null;
  subActivityQuantity: number | null;
  subActivityUnit: string | null;
  resourceCode: string | null;
  resourceDescription: string | null;
  pieces: number | null;
  quantity: number | null;
  unit: string | null;
  unitCost: number | null;
  laborCost: number | null;
  materialCost: number | null;
  matlExpCost: number | null;
  equipmentCost: number | null;
  subcontractCost: number | null;
  lineTotal: number | null;
  lineKind: LineKind;
  rowIndex: number;
  rawText: string;
}

function classifyBucketTokens(tokens: RawToken[]): Pick<ParsedLine, 'laborCost' | 'materialCost' | 'matlExpCost' | 'equipmentCost' | 'subcontractCost' | 'lineTotal'> {
  const out = { laborCost: null, materialCost: null, matlExpCost: null, equipmentCost: null, subcontractCost: null, lineTotal: null } as any;
  for (const t of tokens) {
    const n = parseNumber(t.str);
    if (n === null) continue;
    const bucket = nearestBucket(t.x);
    out[bucket] = n;
  }
  return out;
}

function parseRows(rows: Row[]): ParsedLine[] {
  const results: ParsedLine[] = [];
  let currentBidItemNo: number | null = null;
  let currentBidItemDescription: string | null = null;
  let currentSubActivityCode: string | null = null;
  let currentSubActivityDescription: string | null = null;
  let currentSubActivityQuantity: number | null = null;
  let currentSubActivityUnit: string | null = null;
  let reportFooterStarted = false;

  const base = (rowIndex: number, rawText: string) => ({
    bidItemNo: currentBidItemNo,
    bidItemDescription: currentBidItemDescription,
    subActivityCode: currentSubActivityCode,
    subActivityDescription: currentSubActivityDescription,
    subActivityQuantity: currentSubActivityQuantity,
    subActivityUnit: currentSubActivityUnit,
    resourceCode: null as string | null,
    resourceDescription: null as string | null,
    pieces: null as number | null,
    quantity: null as number | null,
    unit: null as string | null,
    unitCost: null as number | null,
    laborCost: null as number | null,
    materialCost: null as number | null,
    matlExpCost: null as number | null,
    equipmentCost: null as number | null,
    subcontractCost: null as number | null,
    lineTotal: null as number | null,
    rowIndex,
    rawText,
  });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const tokens = row.tokens;
    const text = row.text;
    const rawText = text;
    const firstStr = tokens[0]?.str ?? '';

    if (reportFooterStarted || /Report Totals/i.test(text)) {
      reportFooterStarted = true;
      results.push({ ...base(i, rawText), lineKind: 'report_footer' });
      continue;
    }

    // Page furniture that sometimes falls just under the y>=679 cutoff on some pages: skip
    // calendar-code legend / notes block at the very end (after report_footer already started,
    // handled above) -- nothing else to special-case here.

    if (/^BID$/.test(firstStr) && /ITEM/.test(tokens[1]?.str ?? '')) {
      const m = /BID\s*ITEM\s*=\s*(\d+)/i.exec(text);
      const bidItemNo = m ? parseInt(m[1], 10) : null;
      currentBidItemNo = bidItemNo;
      currentBidItemDescription = null; // filled by the following "Description =" row
      currentSubActivityCode = null;
      currentSubActivityDescription = null;
      currentSubActivityQuantity = null;
      currentSubActivityUnit = null;
      results.push({ ...base(i, rawText), bidItemNo, lineKind: 'bid_item_header' });
      continue;
    }

    if (/^Description$/.test(firstStr)) {
      const m = /Description\s*=\s*(.+?)\s+Unit\s*=/i.exec(text);
      if (m) currentBidItemDescription = m[1].trim();
      results.push({ ...base(i, rawText), lineKind: 'bid_item_header' });
      continue;
    }

    const subActivityMatch = /^(\d{1,4}\.\d{2})$/.exec(firstStr);
    if (subActivityMatch) {
      const code = subActivityMatch[1];
      const descTokens: string[] = [];
      for (const t of tokens.slice(1)) {
        if (t.x >= 288) break; // reached "Quan:" label column
        descTokens.push(t.str);
      }
      const description = descTokens.join(' ').trim() || null;
      const qm = /Quan:\s*([\d,]+\.?\d*)\s*([A-Z]{1,6})/i.exec(text);
      const quantity = qm ? parseNumber(qm[1]) : null;
      const unit = qm ? qm[2] : null;

      currentSubActivityCode = code;
      currentSubActivityDescription = description;
      currentSubActivityQuantity = quantity;
      currentSubActivityUnit = unit;

      results.push({
        ...base(i, rawText),
        subActivityCode: code,
        subActivityDescription: description,
        subActivityQuantity: quantity,
        subActivityUnit: unit,
        lineKind: 'sub_activity_header',
      });
      continue;
    }

    if (/^=====>$/.test(firstStr)) {
      const numericTokens = tokens.filter((t) => t.x >= 300 && parseNumber(t.str) !== null);
      const buckets = classifyBucketTokens(numericTokens);
      results.push({ ...base(i, rawText), ...buckets, lineKind: 'bid_item_total' });
      continue;
    }

    // Resource line: code token (x ~36-39) with at least one letter, not a pure number, and a
    // description token immediately after it (x ~97).
    if (/^[0-9A-Z]{2,15}$/.test(firstStr) && /[A-Z]/.test(firstStr) && parseNumber(firstStr) === null && tokens[0].x < 45) {
      const resourceCode = firstStr;
      const descTokens: string[] = [];
      let idx = 1;
      for (; idx < tokens.length; idx++) {
        if (tokens[idx].x >= 180) break;
        descTokens.push(tokens[idx].str);
      }
      const resourceDescription = descTokens.join(' ').trim() || null;

      const remaining = tokens.slice(idx);
      let pieces: number | null = null;
      let quantity: number | null = null;
      let unit: string | null = null;
      let unitCost: number | null = null;
      let ri = 0;
      // Pcs: first pure-numeric token near x~194
      if (ri < remaining.length && parseNumber(remaining[ri].str) !== null && remaining[ri].x < 210) {
        pieces = parseNumber(remaining[ri].str);
        ri++;
      }
      // Quantity+Unit: next token, may be "80.00 HR" combined (already split into two sub-tokens
      // by our whitespace splitter) or occasionally a bare number with no unit letters.
      if (ri < remaining.length) {
        const qNum = parseNumber(remaining[ri].str);
        if (qNum !== null) {
          quantity = qNum;
          ri++;
          if (ri < remaining.length && /^[A-Z]{1,6}$/.test(remaining[ri].str)) {
            unit = remaining[ri].str;
            ri++;
          }
        }
      }
      // Unit cost: next pure-numeric token near x~302-345
      if (ri < remaining.length && parseNumber(remaining[ri].str) !== null && remaining[ri].x < 350) {
        unitCost = parseNumber(remaining[ri].str);
        ri++;
      }
      const bucketTokens = remaining.slice(ri).filter((t) => parseNumber(t.str) !== null);
      const buckets = classifyBucketTokens(bucketTokens);

      results.push({
        ...base(i, rawText),
        resourceCode,
        resourceDescription,
        pieces,
        quantity,
        unit,
        unitCost,
        ...buckets,
        lineKind: 'resource_line',
      });
      continue;
    }

    // Bare-number subtotal/crew-summary row (e.g. "$35,277.52 320.0000 MH/LS 320.00 MH [ 22654.72 ] 27,009 8,268 35,278"
    // or the unmarked continuation "10,228.830 1 EA 1,750.19 7,567.64 911.00 10,228.83").
    if (parseNumber(firstStr.replace('$', '')) !== null) {
      const bucketTokens = tokens.filter((t) => t.x >= 345 && parseNumber(t.str) !== null);
      const buckets = classifyBucketTokens(bucketTokens);
      results.push({ ...base(i, rawText), ...buckets, lineKind: 'sub_activity_total' });
      continue;
    }

    results.push({ ...base(i, rawText), lineKind: 'other' });
  }

  return results;
}

async function stageCostReport(projectId: string) {
  const rows = await extractRows();
  const parsed = parseRows(rows);

  const toStr = (n: number | null) => (n !== null ? String(n) : null);
  const inserts: (typeof bidItemCostEstimateLines.$inferInsert)[] = parsed.map((p) => ({
    projectId,
    bidItemNo: p.bidItemNo,
    bidItemDescription: p.bidItemDescription,
    subActivityCode: p.subActivityCode,
    subActivityDescription: p.subActivityDescription,
    subActivityQuantity: toStr(p.subActivityQuantity),
    subActivityUnit: p.subActivityUnit,
    resourceCode: p.resourceCode,
    resourceDescription: p.resourceDescription,
    pieces: toStr(p.pieces),
    quantity: toStr(p.quantity),
    unit: p.unit,
    unitCost: toStr(p.unitCost),
    laborCost: toStr(p.laborCost),
    materialCost: toStr(p.materialCost),
    matlExpCost: toStr(p.matlExpCost),
    equipmentCost: toStr(p.equipmentCost),
    subcontractCost: toStr(p.subcontractCost),
    lineTotal: toStr(p.lineTotal),
    lineKind: p.lineKind,
    rowIndex: p.rowIndex,
    rawText: p.rawText,
    sourceFile: COST_REPORT_PDF,
  }));

  await db.delete(bidItemCostEstimateLines).where(eq(bidItemCostEstimateLines.projectId, projectId));
  for (let i = 0; i < inserts.length; i += 200) {
    await db.insert(bidItemCostEstimateLines).values(inserts.slice(i, i + 200));
  }

  const kindCounts: Record<string, number> = {};
  let resourceLineTotalSum = 0;
  let laborSum = 0, materialSum = 0, matlExpSum = 0, equipSum = 0, subSum = 0;
  for (const p of parsed) {
    kindCounts[p.lineKind] = (kindCounts[p.lineKind] || 0) + 1;
    if (p.lineKind === 'resource_line') {
      if (p.lineTotal !== null) resourceLineTotalSum += p.lineTotal;
      if (p.laborCost !== null) laborSum += p.laborCost;
      if (p.materialCost !== null) materialSum += p.materialCost;
      if (p.matlExpCost !== null) matlExpSum += p.matlExpCost;
      if (p.equipmentCost !== null) equipSum += p.equipmentCost;
      if (p.subcontractCost !== null) subSum += p.subcontractCost;
    }
  }
  console.log(`[cost-report-pdf] inserted ${inserts.length} rows from ${COST_REPORT_PDF}`);
  console.log('[cost-report-pdf] line kind counts:', JSON.stringify(kindCounts));
  console.log('[cost-report-pdf] resource_line sums -> total:', resourceLineTotalSum.toLocaleString(),
    'labor:', laborSum.toLocaleString(), 'material:', materialSum.toLocaleString(),
    'matlExp:', matlExpSum.toLocaleString(), 'equipment:', equipSum.toLocaleString(), 'subcontract:', subSum.toLocaleString());
  console.log('[cost-report-pdf] report\'s own printed Report Totals: total $62,286,299 | labor $15,857,899 | material $11,779,587 | matlExp $9,592,374 | equipment $2,511,818 | subcontract $22,544,620');
  return { inserted: inserts.length, kindCounts };
}

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error('Usage: npx tsx scripts/stage-bid-cost-data-pdf.ts <projectId>');
    process.exit(1);
  }
  const [project] = await db.select().from(delayAnalysisProjects).where(eq(delayAnalysisProjects.id, projectId));
  if (!project) {
    console.error(`No delay_analysis_projects row found for id ${projectId}`);
    process.exit(1);
  }
  console.log(`Staging into project: ${project.name} (${project.id})`);

  await stageCostReport(projectId);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
