/**
 * One-off staging script: loads two contractor-provided bid-estimate spreadsheets into
 * bid_item_labor_estimates and bid_item_cost_estimate_lines, for Measured Mile feasibility
 * cross-referencing against POD/corridor/pay-estimate data (see migrations/0007).
 *
 * Not a general upload feature -- run manually against the two known attached_assets files.
 *
 * Usage: npx tsx scripts/stage-bid-cost-data.ts <projectId>
 */
import * as XLSXNamespace from 'xlsx';
const XLSX: any = (XLSXNamespace as any).default ?? XLSXNamespace;
import { db } from '../server/src/infrastructure/database';
import { delayAnalysisProjects, bidItemLaborEstimates, bidItemCostEstimateLines } from '../shared/schema';
import { eq } from 'drizzle-orm';

const LABOR_ESTIMATE_FILE = 'attached_assets/Bid_Item_Summary_-_for_MHs_and_Est_Production_rates_1787929229372.xlsx';
const COST_REPORT_FILE = 'attached_assets/Madison_Direct_Cost_Report_HCSS_1787929472091.xlsx';

function parseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw).replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

async function stageLaborEstimates(projectId: string) {
  const wb = XLSX.readFile(LABOR_ESTIMATE_FILE);
  const ws = wb.Sheets['Bid Items'];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });

  const inserts: (typeof bidItemLaborEstimates.$inferInsert)[] = [];
  for (let i = 1; i < rows.length; i++) {
    const [itemNoRaw, description, quan, mh] = rows[i];
    if (itemNoRaw === null) continue;
    const itemNo = parseNumber(itemNoRaw);
    if (itemNo === null) continue;
    inserts.push({
      projectId,
      itemNo: Math.trunc(itemNo),
      description: description ? String(description).trim() : null,
      quantity: parseNumber(quan) !== null ? String(parseNumber(quan)) : null,
      estimatedManHours: parseNumber(mh) !== null ? String(parseNumber(mh)) : null,
      sourceFile: LABOR_ESTIMATE_FILE,
    });
  }

  await db.delete(bidItemLaborEstimates).where(eq(bidItemLaborEstimates.projectId, projectId));
  for (let i = 0; i < inserts.length; i += 200) {
    await db.insert(bidItemLaborEstimates).values(inserts.slice(i, i + 200));
  }
  console.log(`[labor-estimates] inserted ${inserts.length} rows from ${LABOR_ESTIMATE_FILE}`);
  return inserts.length;
}

type LineKind =
  | 'bid_item_header'
  | 'sub_activity_header'
  | 'resource_line'
  | 'sub_activity_total'
  | 'bid_item_total'
  | 'header_repeat'
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
  lineTotal: number | null;
  lineKind: LineKind;
  rowIndex: number;
  rawText: string;
}

function extractQuantityUnit(text: string): { quantity: number; unit: string; matchEnd: number } | null {
  const m = /([\d,]+\.\d+|\d+)\s*([A-Z]{1,6})\b/.exec(text);
  if (!m) return null;
  const quantity = parseNumber(m[1]);
  if (quantity === null) return null;
  return { quantity, unit: m[2], matchEnd: m.index + m[0].length };
}

function extractAllNumbers(text: string): number[] {
  const matches = text.match(/-?\[?\s*[\d,]+\.\d+\s*\]?|-?\[?\s*[\d,]+\s*\]?/g) || [];
  return matches
    .map((s) => parseNumber(s.replace(/[\[\]]/g, '')))
    .filter((n): n is number => n !== null);
}

function parseCostReportRows(rows: any[][]): ParsedLine[] {
  const results: ParsedLine[] = [];
  let currentBidItemNo: number | null = null;
  let currentBidItemDescription: string | null = null;
  let currentSubActivityCode: string | null = null;
  let currentSubActivityDescription: string | null = null;
  let currentSubActivityQuantity: number | null = null;
  let currentSubActivityUnit: string | null = null;
  let reportFooterStarted = false;

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
    const nonNull = cells.filter((v) => v !== null).map((v) => String(v));
    if (nonNull.length === 0) continue;
    const rawText = nonNull.join(' | ').replace(/\r\n/g, ' ').replace(/\s+/g, ' ').trim();
    const matchText = nonNull.join(' ').replace(/\r\n/g, ' ').replace(/\s+/g, ' ').trim();
    const nextCells = i + 1 < rows.length ? rows[i + 1] : [];
    const nextMatchText = nextCells.filter((v) => v !== null).map((v) => String(v)).join(' ').replace(/\r\n/g, ' ').replace(/\s+/g, ' ').trim();
    const lookahead = `${matchText} ${nextMatchText}`;

    const base = () => ({
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
      lineTotal: null as number | null,
      rowIndex: i,
      rawText,
    });

    if (reportFooterStarted || /Report Totals/i.test(matchText)) {
      reportFooterStarted = true;
      results.push({ ...base(), lineKind: 'report_footer' });
      continue;
    }

    if (/Activity/.test(matchText) && /Resource/.test(matchText) && /Quantity/.test(matchText)) {
      results.push({ ...base(), lineKind: 'header_repeat' });
      continue;
    }

    if (/BID ITEM/i.test(matchText)) {
      let bidItemNo: number | null = null;
      let m = /BID ITEM.*?=\s*(\d+)\s*CLIENT#/i.exec(lookahead);
      if (m) bidItemNo = parseInt(m[1], 10);
      if (bidItemNo === null) {
        m = /BID ITEM\D*?(\d{1,4})/i.exec(lookahead);
        if (m) bidItemNo = parseInt(m[1], 10);
      }
      let description: string | null = null;
      const dm = /Description\s*=\s*([^=]+?)\s+Unit\s*=/i.exec(lookahead);
      if (dm) description = dm[1].trim();

      currentBidItemNo = bidItemNo;
      currentBidItemDescription = description;
      currentSubActivityCode = null;
      currentSubActivityDescription = null;
      currentSubActivityQuantity = null;
      currentSubActivityUnit = null;

      results.push({
        ...base(),
        bidItemNo: currentBidItemNo,
        bidItemDescription: currentBidItemDescription,
        subActivityCode: null,
        subActivityDescription: null,
        subActivityQuantity: null,
        subActivityUnit: null,
        lineKind: 'bid_item_header',
      });
      continue;
    }

    const firstCell = nonNull[0];
    const subActivityMatch = /^(\d{1,4}\.\d{2})$/.exec(firstCell);
    if (subActivityMatch) {
      const code = subActivityMatch[1];
      let description: string | null = null;
      const descMatch = /^[\d.]+\s+([A-Z0-9 ,.\-\/#&']+?)\s*(?:Quan:|$)/i.exec(matchText);
      if (descMatch) description = descMatch[1].trim();
      let quantity: number | null = null;
      let unit: string | null = null;
      const qm = /Quan:\s*([\d,]+\.?\d*)\s*([A-Z]{1,6})/i.exec(lookahead);
      if (qm) {
        quantity = parseNumber(qm[1]);
        unit = qm[2];
      }

      currentSubActivityCode = code;
      currentSubActivityDescription = description;
      currentSubActivityQuantity = quantity;
      currentSubActivityUnit = unit;

      results.push({
        ...base(),
        subActivityCode: code,
        subActivityDescription: description,
        subActivityQuantity: quantity,
        subActivityUnit: unit,
        lineKind: 'sub_activity_header',
      });
      continue;
    }

    if (/^=====>/.test(matchText)) {
      const dm = /\$([\d,]+\.\d+)/.exec(matchText);
      results.push({
        ...base(),
        lineTotal: dm ? parseNumber(dm[1]) : null,
        lineKind: 'bid_item_total',
      });
      continue;
    }

    // Resource code line: first cell is alphanumeric with at least one letter, not a pure number.
    if (/^[0-9A-Z]{2,15}$/.test(firstCell) && /[A-Z]/.test(firstCell) && parseNumber(firstCell) === null) {
      const resourceCode = firstCell;
      const resourceDescription = nonNull[1] && parseNumber(nonNull[1]) === null ? nonNull[1] : null;
      const afterDesc = matchText.slice(matchText.indexOf(resourceCode) + resourceCode.length);
      const qu = extractQuantityUnit(afterDesc);
      let quantity: number | null = null;
      let unit: string | null = null;
      let unitCost: number | null = null;
      let lineTotal: number | null = null;
      if (qu) {
        quantity = qu.quantity;
        unit = qu.unit;
        const remaining = afterDesc.slice(qu.matchEnd);
        const nums = extractAllNumbers(remaining);
        if (nums.length > 0) {
          unitCost = nums[0];
          lineTotal = nums[nums.length - 1];
        }
      }
      let pieces: number | null = null;
      const pm = /^\s*(\d+)\s/.exec(afterDesc.replace(resourceDescription || '', ''));
      if (pm) pieces = parseNumber(pm[1]);

      results.push({
        ...base(),
        resourceCode,
        resourceDescription,
        pieces,
        quantity,
        unit,
        unitCost,
        lineTotal,
        lineKind: 'resource_line',
      });
      continue;
    }

    // Bare-number subtotal row (sub-activity rollup), e.g. "1468320 [  ] 1468320 1468320"
    if (parseNumber(firstCell) !== null && /\[\s*\]/.test(matchText)) {
      const nums = extractAllNumbers(matchText);
      results.push({
        ...base(),
        lineTotal: nums.length > 0 ? nums[nums.length - 1] : null,
        lineKind: 'sub_activity_total',
      });
      continue;
    }

    results.push({ ...base(), lineKind: 'other' });
  }

  return results;
}

async function stageCostReport(projectId: string) {
  const wb = XLSX.readFile(COST_REPORT_FILE);
  const ws = wb.Sheets['Table 1'];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
  const parsed = parseCostReportRows(rows);

  const inserts: (typeof bidItemCostEstimateLines.$inferInsert)[] = parsed.map((p) => ({
    projectId,
    bidItemNo: p.bidItemNo,
    bidItemDescription: p.bidItemDescription,
    subActivityCode: p.subActivityCode,
    subActivityDescription: p.subActivityDescription,
    subActivityQuantity: p.subActivityQuantity !== null ? String(p.subActivityQuantity) : null,
    subActivityUnit: p.subActivityUnit,
    resourceCode: p.resourceCode,
    resourceDescription: p.resourceDescription,
    pieces: p.pieces !== null ? String(p.pieces) : null,
    quantity: p.quantity !== null ? String(p.quantity) : null,
    unit: p.unit,
    unitCost: p.unitCost !== null ? String(p.unitCost) : null,
    lineTotal: p.lineTotal !== null ? String(p.lineTotal) : null,
    lineKind: p.lineKind,
    rowIndex: p.rowIndex,
    rawText: p.rawText,
    sourceFile: COST_REPORT_FILE,
  }));

  await db.delete(bidItemCostEstimateLines).where(eq(bidItemCostEstimateLines.projectId, projectId));
  for (let i = 0; i < inserts.length; i += 200) {
    await db.insert(bidItemCostEstimateLines).values(inserts.slice(i, i + 200));
  }

  const kindCounts: Record<string, number> = {};
  let resourceLineTotalSum = 0;
  for (const p of parsed) {
    kindCounts[p.lineKind] = (kindCounts[p.lineKind] || 0) + 1;
    if (p.lineKind === 'resource_line' && p.lineTotal !== null) resourceLineTotalSum += p.lineTotal;
  }
  console.log(`[cost-report] inserted ${inserts.length} rows from ${COST_REPORT_FILE}`);
  console.log('[cost-report] line kind counts:', JSON.stringify(kindCounts));
  console.log('[cost-report] sum of resource_line.lineTotal (validation vs Report Totals grand total 62,286,299):', resourceLineTotalSum.toLocaleString());
  return { inserted: inserts.length, kindCounts, resourceLineTotalSum };
}

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error('Usage: npx tsx scripts/stage-bid-cost-data.ts <projectId>');
    process.exit(1);
  }
  const [project] = await db.select().from(delayAnalysisProjects).where(eq(delayAnalysisProjects.id, projectId));
  if (!project) {
    console.error(`No delay_analysis_projects row found for id ${projectId}`);
    process.exit(1);
  }
  console.log(`Staging into project: ${project.name} (${project.id})`);

  await stageLaborEstimates(projectId);
  await stageCostReport(projectId);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
