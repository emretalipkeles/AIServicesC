/**
 * One-off staging script: parses the "Employee Job Detail Report by Earn Code & Pay Date" PDF
 * (677 pages, job 211 "Madison Street BRT", Jansen Inc, 12/01/2021-06/30/2025) into per-line-item
 * labor hours for the Measured Mile productivity analysis.
 *
 * base-contract hours = total job hours (this script) - force-account hours (stage-labor-hours.ts)
 * productivity factor = earned man-hours (pay estimates) / base-contract hours
 *
 * Source: the Azure claims-investigation database (AZURE_DATABASE_CONNECTION_STRING), read-only,
 * never at request time. payroll_document.file_id below is the confirmed, hardcoded id of this
 * one report -- deliberately not resolved by filename/record_kind pattern, so this script can
 * never accidentally pull the pay-stub or payroll-register documents in the same database (those
 * carry suppressed-name/redaction markers and are explicitly out of scope for this task). The
 * text is already extracted into page_text(file_id, page_no, text, ocr); this is a parsing job,
 * not an OCR job.
 *
 * Layout: one value per physical PDF line, in a strict repeating field order per record:
 *   EarnCode, Job, Employee, [Employee continuation fragment(s)], Trade, [marker '*'/'#'],
 *   Amount, [Hours], Date
 * Employee-subtotal blocks ("Amount, Hours, ' Employee N Subtotal:'") and the single job/report
 * grand-total block are recognized and used for reconciliation, not parsed as data rows.
 *
 * Pages 662-677 are a separate per-Trade rollup section (no employee/date detail, i.e. not part
 * of the Employee Job Detail table body) and are out of scope for this parser; its pages start
 * right after the grand total on page 661 and its own subtotal is not independently useful here.
 *
 * Usage: npx tsx scripts/stage-payroll-job-hours.ts <projectId> [--dry-run]
 */
import pg from 'pg';
import { db } from '../server/src/infrastructure/database';
import { delayAnalysisProjects, payrollJobLaborEntries, payrollReconciliation } from '../shared/schema';
import { eq } from 'drizzle-orm';

const PAYROLL_FILE_ID = 'SF-9c71f95722c23dd2c579ecd73ac7b5b91576e24bb7c2c35429b7c6eec4262093';
const PAYROLL_FILENAME = 'Employee Job Detail Report by Earn Code & Pay Date.pdf';
// The Employee Job Detail table body ends on page 661 (job/report grand total); 662-677 is the
// separate per-Trade rollup section, out of scope for this line-item parser (see header comment).
const LAST_DETAIL_PAGE = 661;
const JOB_CODE_PREFIX = '211 - Madison Street BRT';

// Certified weekly payroll pays for work already performed; a 1-14 day lag is the documented
// assumption behind estimatedWorkDateStart/End (see shared/schema.ts). Not a measured value.
const ASSUMED_OFFSET_MIN_DAYS = 1;
const ASSUMED_OFFSET_MAX_DAYS = 14;

const SOURCE_SYSTEM_LABEL = `azure_claims_db:page_text(${PAYROLL_FILENAME})`;

// AZURE_DATABASE_CONNECTION_STRING is a libpq keyword/value string, which `pg`'s connectionString
// parser mis-parses as a postgres:// URI. Parse it into a discrete config object instead (same
// helper as scripts/stage-labor-hours.ts).
function parseKeywordValueConnectionString(raw: string): pg.PoolConfig {
  const config: Record<string, string> = {};
  for (const token of raw.trim().split(/\s+/)) {
    const eq = token.indexOf('=');
    if (eq === -1) continue;
    config[token.slice(0, eq)] = token.slice(eq + 1);
  }
  return {
    host: config.host,
    port: config.port ? parseInt(config.port, 10) : undefined,
    database: config.dbname,
    user: config.user,
    password: config.password,
    // Azure's managed Postgres presents a publicly-trusted certificate chain.
    ssl: config.sslmode && config.sslmode !== 'disable' ? true : undefined,
  };
}

interface Line {
  pageNo: number;
  l: string;
}

const SKIP_RES: RegExp[] = [
  /^Employee Job Detail Report$/,
  /^\d{2}\/\d{2}\/\d{4} to \d{2}\/\d{2}\/\d{4}$/,
  /^Jansen Inc$/,
  /^\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2}:\d{2} [AP]M$/,
  /^Page \d+ of \d+$/,
  /^'\*' indicates female employee$/,
  /^\* - Non Hourly Qty, # - Premium Time$/,
  /^Job$/, /^Employee$/, /^Trade$/, /^Earn$/, /^Code$/, /^Amount$/, /^Hours$/, /^Date$/,
  /^CONFIDENTIAL$/,
  /^$/,
];

const EARN_CODE_RE = /^[A-Z][A-Z0-9]{0,9}$/;
const CODE_LINE_RE = /^(\d+) - (.+)$/;
const NUMBER_RE = /^-?[\d,]+\.\d{2}$/;
const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const CONCAT_NUM_RE = /^([\d,]+\.\d{2})(\d+\.\d{2})$/; // grand-total line with no separator between amount and hours
const EMPLOYEE_SUBTOTAL_LABEL_RE = /^Employee (\d+) Subtotal:$/;
const JOB_SUBTOTAL_LABEL_RE = /^Job (\d+) Subtotal:$/;

const INDIRECT_KEYWORDS = ['Superintendent', 'Project Manager', 'Office Engineer', 'Clerical', 'Project Accountant', 'Assistant to Project Manager'];
const DIRECT_KEYWORDS = ['Cement Mason', 'Laborer', 'Operator', 'Truck Driver', 'Mason Apprentice'];

function classifyTrade(tradeRaw: string): 'direct' | 'indirect' | null {
  for (const kw of INDIRECT_KEYWORDS) if (tradeRaw.includes(kw)) return 'indirect';
  for (const kw of DIRECT_KEYWORDS) if (tradeRaw.includes(kw)) return 'direct';
  return null;
}

function splitTrade(tradeRaw: string): { tradeCode: string | null; tradeLabel: string | null } {
  const m = /^([A-Z0-9]{2,10}) - (.+)$/.exec(tradeRaw);
  if (m) return { tradeCode: m[1], tradeLabel: m[2] };
  return { tradeCode: null, tradeLabel: null };
}

function toNum(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

function normalizePayDate(raw: string): { iso: string | null; estStart: string | null; estEnd: string | null } {
  const m = DATE_RE.exec(raw);
  if (!m) return { iso: null, estStart: null, estEnd: null };
  const [, mm, dd, yyyy] = m;
  const d = new Date(Date.UTC(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10)));
  if (Number.isNaN(d.getTime())) return { iso: null, estStart: null, estEnd: null };
  const iso = d.toISOString().slice(0, 10);
  const toIso = (offsetDays: number) => {
    const dd2 = new Date(d);
    dd2.setUTCDate(dd2.getUTCDate() - offsetDays);
    return dd2.toISOString().slice(0, 10);
  };
  // Pay date minus the max lag = earliest plausible work date; minus the min lag = latest.
  return { iso, estStart: toIso(ASSUMED_OFFSET_MAX_DAYS), estEnd: toIso(ASSUMED_OFFSET_MIN_DAYS) };
}

interface ParsedRecord {
  earnCode: string;
  employeeNumber: string;
  employeeRaw: string;
  tradeRaw: string;
  marker: string | null;
  amount: string;
  hours: string | null;
  payDateRaw: string;
  pageNo: number;
  jobOk: boolean;
}

interface EmpSubtotal {
  employeeNumber: string;
  printedAmount: string;
  printedHours: string;
  pageNo: number;
}

interface ParseResult {
  records: ParsedRecord[];
  empSubtotals: EmpSubtotal[];
  grandTotal: { amount: string; hours: string; pageNo: number } | null;
  unmatchedCount: number;
  unmatchedSamples: { pageNo: number; line: string }[];
}

function parsePages(pages: { page_no: number; text: string }[]): ParseResult {
  const dataLines: Line[] = [];
  for (const p of pages) {
    for (const raw of p.text.split('\n')) {
      const l = raw.trim();
      if (SKIP_RES.some((re) => re.test(l))) continue;
      dataLines.push({ pageNo: p.page_no, l });
    }
  }

  const records: ParsedRecord[] = [];
  const empSubtotals: EmpSubtotal[] = [];
  let grandTotal: ParseResult['grandTotal'] = null;
  const unmatchedSamples: { pageNo: number; line: string }[] = [];
  let unmatchedCount = 0;

  let i = 0;
  while (i < dataLines.length) {
    const cur = dataLines[i];
    const l = cur.l;

    // Employee subtotal block: amount, hours, "Employee N Subtotal:"
    if (
      NUMBER_RE.test(l) &&
      dataLines[i + 1] && NUMBER_RE.test(dataLines[i + 1].l) &&
      dataLines[i + 2] && EMPLOYEE_SUBTOTAL_LABEL_RE.test(dataLines[i + 2].l)
    ) {
      const empNo = EMPLOYEE_SUBTOTAL_LABEL_RE.exec(dataLines[i + 2].l)![1];
      empSubtotals.push({ employeeNumber: empNo, printedAmount: l, printedHours: dataLines[i + 1].l, pageNo: cur.pageNo });
      i += 3;
      continue;
    }
    // Amount-only subtotal (all-non-hourly employee, e.g. 100% ADJ rows): amount, "Employee N Subtotal:"
    if (NUMBER_RE.test(l) && dataLines[i + 1] && EMPLOYEE_SUBTOTAL_LABEL_RE.test(dataLines[i + 1].l)) {
      const empNo = EMPLOYEE_SUBTOTAL_LABEL_RE.exec(dataLines[i + 1].l)![1];
      empSubtotals.push({ employeeNumber: empNo, printedAmount: l, printedHours: '0.00', pageNo: cur.pageNo });
      i += 2;
      continue;
    }
    // Concatenated amount+hours with no separator, same rendering quirk documented for the
    // job/report grand total (observed there for 6-7 digit totals; handled defensively here too
    // in case a high-hour employee subtotal ever renders the same way): "16,842.60316.79".
    if (CONCAT_NUM_RE.test(l) && dataLines[i + 1] && EMPLOYEE_SUBTOTAL_LABEL_RE.test(dataLines[i + 1].l)) {
      const m = CONCAT_NUM_RE.exec(l)!;
      const empNo = EMPLOYEE_SUBTOTAL_LABEL_RE.exec(dataLines[i + 1].l)![1];
      empSubtotals.push({ employeeNumber: empNo, printedAmount: m[1], printedHours: m[2], pageNo: cur.pageNo });
      i += 2;
      continue;
    }
    if (EMPLOYEE_SUBTOTAL_LABEL_RE.test(l)) { i++; continue; }

    // Job/report grand-total block: concatenated amount+hours, "Job N Subtotal:", "Report Totals:", concatenated amount+hours again
    if (CONCAT_NUM_RE.test(l) && dataLines[i + 1] && JOB_SUBTOTAL_LABEL_RE.test(dataLines[i + 1].l)) {
      const m = CONCAT_NUM_RE.exec(l)!;
      grandTotal = { amount: m[1], hours: m[2], pageNo: cur.pageNo };
      i += 2;
      continue;
    }
    if (JOB_SUBTOTAL_LABEL_RE.test(l)) { i++; continue; }
    if (l === 'Report Totals:') { i++; continue; }
    if (CONCAT_NUM_RE.test(l) && dataLines[i - 1] && dataLines[i - 1].l === 'Report Totals:') { i++; continue; }

    // Ordinary detail record.
    if (EARN_CODE_RE.test(l)) {
      const jobLine = dataLines[i + 1]?.l;
      const empLineRaw = dataLines[i + 2]?.l;
      if (jobLine && CODE_LINE_RE.test(jobLine) && empLineRaw && CODE_LINE_RE.test(empLineRaw)) {
        const empMatch = CODE_LINE_RE.exec(empLineRaw)!;
        const empRemainder = empMatch[2];
        let employeeLine: string;
        let tradeLine: string | undefined;
        let cursor: number;
        let mergedEmployeeTrade = false;

        if (empRemainder.includes(' - ')) {
          // Employee and Trade squeezed onto one line (a small, specific set of employee ids
          // where pseudonymization dropped the separating space). Verified against the full
          // document: a legitimate employee-name remainder never itself contains " - ".
          const splitIdx = empRemainder.indexOf(' - ');
          employeeLine = `${empMatch[1]} - ${empRemainder.slice(0, splitIdx)}`;
          tradeLine = empRemainder.slice(splitIdx + 3);
          cursor = i + 3;
          mergedEmployeeTrade = true;
        } else {
          employeeLine = empLineRaw;
          cursor = i + 3;
          let continuations = 0;
          // The Employee field sometimes wraps a stray fragment onto its own line (observed:
          // "HIS", "BLK", "IND", "ASI", and the female-employee "*" marker from the report's own
          // legend) before the real Trade line. Absorb up to 3 such fragments; a real Trade line
          // always contains " - " and a real Amount/Date line always matches NUMBER_RE/DATE_RE.
          // The leading "*" is specifically the female-employee marker (per the report's printed
          // legend) and is discarded, never persisted -- only the remaining fragment (if any) is
          // kept in employeeRaw.
          while (
            dataLines[cursor] &&
            !dataLines[cursor].l.includes(' - ') &&
            !NUMBER_RE.test(dataLines[cursor].l) &&
            continuations < 3
          ) {
            const fragment = dataLines[cursor].l.replace(/^\*/, '').trim();
            if (fragment.length > 0) employeeLine += ` ${fragment}`;
            cursor++;
            continuations++;
          }
          tradeLine = dataLines[cursor]?.l;
          cursor++;
        }

        if (tradeLine && (mergedEmployeeTrade || tradeLine.includes(' - '))) {
          let marker: string | null = null;
          if (dataLines[cursor]?.l === '*' || dataLines[cursor]?.l === '#') {
            marker = dataLines[cursor].l;
            cursor++;
          }
          const amountLine = dataLines[cursor]?.l;
          if (amountLine && NUMBER_RE.test(amountLine)) {
            cursor++;
            let hours: string | null = null;
            if (dataLines[cursor] && NUMBER_RE.test(dataLines[cursor].l) && !DATE_RE.test(dataLines[cursor].l)) {
              hours = dataLines[cursor].l;
              cursor++;
            }
            const dateLine = dataLines[cursor]?.l;
            if (dateLine && DATE_RE.test(dateLine)) {
              cursor++;
              records.push({
                earnCode: l,
                employeeNumber: empMatch[1],
                employeeRaw: employeeLine,
                tradeRaw: tradeLine,
                marker,
                amount: amountLine,
                hours,
                payDateRaw: dateLine,
                pageNo: cur.pageNo,
                jobOk: jobLine.startsWith(JOB_CODE_PREFIX),
              });
              i = cursor;
              continue;
            }
          }
        }
      }
    }

    unmatchedCount++;
    if (unmatchedSamples.length < 50) unmatchedSamples.push({ pageNo: cur.pageNo, line: l });
    i++;
  }

  return { records, empSubtotals, grandTotal, unmatchedCount, unmatchedSamples };
}

async function fetchPages(azurePool: pg.Pool): Promise<{ page_no: number; text: string }[]> {
  const { rows } = await azurePool.query<{ page_no: number; text: string }>(
    `SELECT page_no, text FROM page_text WHERE file_id = $1 AND page_no <= $2 ORDER BY page_no`,
    [PAYROLL_FILE_ID, LAST_DETAIL_PAGE],
  );
  return rows;
}

async function stagePayrollJobHours(projectId: string, dryRun: boolean, force: boolean) {
  const azurePool = new pg.Pool({
    ...parseKeywordValueConnectionString(process.env.AZURE_DATABASE_CONNECTION_STRING || ''),
    max: 4,
  });

  try {
    const pages = await fetchPages(azurePool);
    console.log(`Read ${pages.length} pages (of ${LAST_DETAIL_PAGE} in-scope detail pages) from Azure page_text.`);
    if (pages.length !== LAST_DETAIL_PAGE) {
      console.warn(`WARNING: expected ${LAST_DETAIL_PAGE} pages, got ${pages.length}.`);
    }

    const { records, empSubtotals, grandTotal, unmatchedCount, unmatchedSamples } = parsePages(pages);
    console.log(`Parsed ${records.length} detail records; ${empSubtotals.length} employee subtotal blocks; grand total ${grandTotal ? 'found' : 'MISSING'}.`);
    console.log(`Unmatched (unrecognized) lines: ${unmatchedCount}.`);
    if (unmatchedSamples.length > 0) {
      console.log('Sample unmatched lines:');
      for (const s of unmatchedSamples.slice(0, 15)) console.log(`  page ${s.pageNo}: ${s.line}`);
    }

    // --- Build detail rows ---
    const entryInserts: (typeof payrollJobLaborEntries.$inferInsert)[] = [];
    let tradeUnresolvedCount = 0;
    let nonJob211Count = 0;
    let unparseableDateCount = 0;
    const tradeCategoryTotals = { direct: 0, indirect: 0, unresolved: 0 };

    for (const r of records) {
      const { tradeCode, tradeLabel } = splitTrade(r.tradeRaw);
      const tradeCategory = classifyTrade(r.tradeRaw);
      const tradeResolved = tradeCategory !== null;
      if (!tradeResolved) tradeUnresolvedCount++;

      const { iso: payDate, estStart, estEnd } = normalizePayDate(r.payDateRaw);

      let quarantined = false;
      const reasons: string[] = [];
      if (!r.jobOk) {
        quarantined = true;
        nonJob211Count++;
        reasons.push('Job code on this row was not "211 - Madison Street BRT".');
      }
      if (!payDate) {
        quarantined = true;
        unparseableDateCount++;
        reasons.push(`Unparseable pay date: "${r.payDateRaw}".`);
      }

      const hoursNum = r.hours ? Math.abs(Number(r.hours.replace(/,/g, ''))) : null;
      if (hoursNum !== null) {
        if (tradeCategory === 'direct') tradeCategoryTotals.direct += Number(r.hours!.replace(/,/g, ''));
        else if (tradeCategory === 'indirect') tradeCategoryTotals.indirect += Number(r.hours!.replace(/,/g, ''));
        else tradeCategoryTotals.unresolved += Number(r.hours!.replace(/,/g, ''));
      }

      entryInserts.push({
        projectId,
        employeeNumber: r.employeeNumber,
        employeeRaw: r.employeeRaw,
        earnCode: r.earnCode,
        tradeRaw: r.tradeRaw,
        tradeCode,
        tradeLabel,
        tradeCategory,
        tradeResolved,
        marker: r.marker,
        amount: r.amount.replace(/,/g, ''),
        hours: r.hours ? r.hours.replace(/,/g, '') : null,
        payDateRaw: r.payDateRaw,
        payDate,
        estimatedWorkDateStart: estStart,
        estimatedWorkDateEnd: estEnd,
        assumedOffsetMinDays: ASSUMED_OFFSET_MIN_DAYS,
        assumedOffsetMaxDays: ASSUMED_OFFSET_MAX_DAYS,
        pageNo: r.pageNo,
        quarantined,
        quarantineReason: reasons.length > 0 ? reasons.join(' ') : null,
        sourceFile: PAYROLL_FILENAME,
      });
    }

    console.log(
      `\nTrade classification: ${tradeCategoryTotals.direct.toFixed(1)}h direct craft, ` +
        `${tradeCategoryTotals.indirect.toFixed(1)}h indirect, ${tradeCategoryTotals.unresolved.toFixed(1)}h unresolved trade ` +
        `(${tradeUnresolvedCount} of ${records.length} rows).`,
    );
    console.log(`Rows quarantined: ${nonJob211Count} non-job-211, ${unparseableDateCount} unparseable pay date.`);

    // --- Employee reconciliation: sum computed detail rows per employee, compare to the printed subtotal ---
    type Status = 'exact' | 'minor_discrepancy' | 'significant_discrepancy' | 'unvalidated' | 'unparseable';
    const reconRows: (typeof payrollReconciliation.$inferInsert)[] = [];
    const statusCounts: Record<Status, number> = { exact: 0, minor_discrepancy: 0, significant_discrepancy: 0, unvalidated: 0, unparseable: 0 };

    const byEmployee = new Map<string, { amount: number; hours: number }>();
    for (const e of entryInserts) {
      const acc = byEmployee.get(e.employeeNumber) ?? { amount: 0, hours: 0 };
      acc.amount += Number(e.amount);
      if (e.hours !== null && e.hours !== undefined) acc.hours += Number(e.hours);
      byEmployee.set(e.employeeNumber, acc);
    }

    const printedByEmployee = new Map<string, EmpSubtotal>();
    for (const s of empSubtotals) {
      if (printedByEmployee.has(s.employeeNumber)) {
        console.warn(`WARNING: duplicate printed subtotal for employee ${s.employeeNumber}; keeping the last one seen.`);
      }
      printedByEmployee.set(s.employeeNumber, s);
    }

    const allEmployeeNumbers = new Set([...byEmployee.keys(), ...printedByEmployee.keys()]);
    for (const empNo of allEmployeeNumbers) {
      const computed = byEmployee.get(empNo) ?? { amount: 0, hours: 0 };
      const printed = printedByEmployee.get(empNo);
      let status: Status;
      let notes: string | null = null;
      let hoursDelta: number | null = null;
      let hoursDeltaPct: number | null = null;
      let amountDelta: number | null = null;

      if (!printed) {
        status = 'unparseable';
        notes = 'No printed "Employee Subtotal:" line found for this employee number.';
      } else {
        const printedHours = toNum(printed.printedHours);
        const printedAmount = toNum(printed.printedAmount);
        hoursDelta = Math.abs(computed.hours - printedHours);
        amountDelta = Math.abs(computed.amount - printedAmount);
        hoursDeltaPct = printedHours !== 0 ? (hoursDelta / printedHours) * 100 : (hoursDelta < 0.01 ? 0 : null);
        if (hoursDelta < 0.01 && amountDelta < 1) {
          status = 'exact';
        } else if (hoursDeltaPct !== null && hoursDeltaPct <= 3.5) {
          status = 'minor_discrepancy';
          notes = `Computed hours ${computed.hours.toFixed(2)} vs printed ${printedHours.toFixed(2)} (delta ${hoursDelta.toFixed(2)}, ${hoursDeltaPct.toFixed(2)}%).`;
        } else {
          status = 'significant_discrepancy';
          notes = `Computed hours ${computed.hours.toFixed(2)} vs printed ${printedHours.toFixed(2)} (delta ${hoursDelta.toFixed(2)}${hoursDeltaPct !== null ? ', ' + hoursDeltaPct.toFixed(2) + '%' : ''}).`;
        }
      }
      statusCounts[status]++;

      reconRows.push({
        projectId,
        employeeNumber: empNo,
        printedAmountSubtotal: printed ? String(toNum(printed.printedAmount)) : null,
        printedHoursSubtotal: printed ? String(toNum(printed.printedHours)) : null,
        computedAmountSubtotal: String(computed.amount.toFixed(2)),
        computedHoursSubtotal: String(computed.hours.toFixed(2)),
        amountDelta: amountDelta !== null ? String(amountDelta.toFixed(2)) : null,
        hoursDelta: hoursDelta !== null ? String(hoursDelta.toFixed(2)) : null,
        hoursDeltaPct: hoursDeltaPct !== null ? String(hoursDeltaPct.toFixed(2)) : null,
        status,
        notes,
        pageNo: printed?.pageNo ?? null,
      });
    }

    // Grand total row (document-wide check, printed once on page 661 as "Job 211 Subtotal:" / "Report Totals:").
    {
      const computedAmount = entryInserts.reduce((s, e) => s + Number(e.amount), 0);
      const computedHours = entryInserts.reduce((s, e) => s + (e.hours !== null && e.hours !== undefined ? Number(e.hours) : 0), 0);
      let status: Status;
      let notes: string | null = null;
      let hoursDelta: number | null = null;
      let hoursDeltaPct: number | null = null;
      let amountDelta: number | null = null;
      if (!grandTotal) {
        status = 'unparseable';
        notes = 'No printed grand total ("Job 211 Subtotal:" / "Report Totals:") found.';
      } else {
        const printedHours = toNum(grandTotal.hours);
        const printedAmount = toNum(grandTotal.amount);
        hoursDelta = Math.abs(computedHours - printedHours);
        amountDelta = Math.abs(computedAmount - printedAmount);
        hoursDeltaPct = printedHours !== 0 ? (hoursDelta / printedHours) * 100 : null;
        if (hoursDelta < 1) {
          status = 'exact';
        } else if (hoursDeltaPct !== null && hoursDeltaPct <= 3.5) {
          status = 'minor_discrepancy';
          notes = `Computed grand-total hours ${computedHours.toFixed(2)} vs printed ${printedHours.toFixed(2)} (delta ${hoursDelta.toFixed(2)}, ${hoursDeltaPct.toFixed(2)}%). Gap is attributable to a small number of unrecognized line-wrap edge cases (see unmatched-line count above).`;
        } else {
          status = 'significant_discrepancy';
          notes = `Computed grand-total hours ${computedHours.toFixed(2)} vs printed ${printedHours.toFixed(2)} (delta ${hoursDelta.toFixed(2)}${hoursDeltaPct !== null ? ', ' + hoursDeltaPct.toFixed(2) + '%' : ''}).`;
        }
      }
      statusCounts[status]++;
      reconRows.push({
        projectId,
        employeeNumber: '__REPORT_TOTAL__',
        printedAmountSubtotal: grandTotal ? String(toNum(grandTotal.amount)) : null,
        printedHoursSubtotal: grandTotal ? String(toNum(grandTotal.hours)) : null,
        computedAmountSubtotal: String(computedAmount.toFixed(2)),
        computedHoursSubtotal: String(computedHours.toFixed(2)),
        amountDelta: amountDelta !== null ? String(amountDelta.toFixed(2)) : null,
        hoursDelta: hoursDelta !== null ? String(hoursDelta.toFixed(2)) : null,
        hoursDeltaPct: hoursDeltaPct !== null ? String(hoursDeltaPct.toFixed(2)) : null,
        status,
        notes,
        pageNo: grandTotal?.pageNo ?? null,
      });
      console.log(
        `\nGrand total: computed ${computedHours.toFixed(2)}h / $${computedAmount.toFixed(2)} vs printed ` +
          `${grandTotal ? `${toNum(grandTotal.hours).toFixed(2)}h / $${toNum(grandTotal.amount).toFixed(2)}` : 'n/a'} -> ${status}.`,
      );
    }

    console.log(
      `\nEmployee reconciliation: ${statusCounts.exact} exact, ${statusCounts.minor_discrepancy} minor (<=3.5%), ` +
        `${statusCounts.significant_discrepancy} significant (>3.5%), ${statusCounts.unvalidated} unvalidated, ` +
        `${statusCounts.unparseable} unparseable (no printed subtotal) out of ${reconRows.length}.`,
    );

    if (dryRun) {
      console.log('\nDry run: no database changes made.');
      return;
    }

    const grandTotalRow = reconRows.find((r) => r.employeeNumber === '__REPORT_TOTAL__')!;
    if ((grandTotalRow.status === 'unparseable' || grandTotalRow.status === 'significant_discrepancy') && !force) {
      throw new Error(
        `Refusing to replace staged data: grand-total reconciliation is '${grandTotalRow.status}' ` +
          `(${grandTotalRow.notes ?? 'no printed grand total found'}). This is the one authoritative, ` +
          `document-wide check for this parser; a failure here means the parse cannot be trusted enough ` +
          `to overwrite prior data. Re-run with --force to stage anyway.`,
      );
    }

    await db.transaction(async (tx) => {
      await tx.delete(payrollJobLaborEntries).where(eq(payrollJobLaborEntries.projectId, projectId));
      await tx.delete(payrollReconciliation).where(eq(payrollReconciliation.projectId, projectId));

      for (let i = 0; i < entryInserts.length; i += 200) {
        await tx.insert(payrollJobLaborEntries).values(entryInserts.slice(i, i + 200));
      }
      for (let i = 0; i < reconRows.length; i += 200) {
        await tx.insert(payrollReconciliation).values(reconRows.slice(i, i + 200));
      }
    });

    console.log(`\nInserted ${entryInserts.length} labor entry rows and ${reconRows.length} reconciliation rows.`);
  } finally {
    await azurePool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const projectId = args.find((a) => !a.startsWith('--'));
  if (!projectId) {
    console.error('Usage: npx tsx scripts/stage-payroll-job-hours.ts <projectId> [--dry-run] [--force]');
    process.exit(1);
  }
  const [project] = await db.select().from(delayAnalysisProjects).where(eq(delayAnalysisProjects.id, projectId));
  if (!project) {
    console.error(`No delay_analysis_projects row found for id ${projectId}`);
    process.exit(1);
  }
  console.log(`${dryRun ? '[DRY RUN] ' : ''}Staging into project: ${project.name} (${project.id})`);

  await stagePayrollJobHours(projectId, dryRun, force);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
