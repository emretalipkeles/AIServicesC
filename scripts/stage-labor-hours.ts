/**
 * One-off staging script: pulls measured force-account labor/equipment hours and owner-inspector
 * daily crew counts from the separate Azure claims-investigation database
 * (AZURE_DATABASE_CONNECTION_STRING) into this app's own database, for the Measured Mile
 * productivity analysis.
 *
 * The Azure database is a claims-investigation database entirely separate from this app's
 * schema, covering the same job (contractor "Jansen Inc.", payroll job code
 * "211 - Madison Street BRT"). It is queried read-only here and never at request time -- staged
 * once, like the pay estimates, so the app keeps one data source.
 *
 * Source 1: cost_transaction, filtered to FORCE_ACCOUNT_LABOR / FORCE_ACCOUNT_PRIME_EQUIPMENT /
 * FORCE_ACCOUNT_EQUIPMENT. Every row is force account (changed/extra work), not base-contract
 * production -- see the note on forceAccountTransactions in shared/schema.ts. Each row is one
 * occurrence of the money already deduplicated across source copies (per the source's own
 * extraction_basis annotation); n_source_copies must never be used as a multiplier.
 *
 * Source 2: daily_report + daily_report_field, filtered to the crew_roster field (a plain
 * integer headcount) plus a few narrative fields kept for context.
 *
 * Usage: npx tsx scripts/stage-labor-hours.ts <projectId> [--dry-run]
 */
import pg from 'pg';
import { db } from '../server/src/infrastructure/database';
import { delayAnalysisProjects, forceAccountTransactions, inspectorDailyReports } from '../shared/schema';
import { eq } from 'drizzle-orm';

const FORCE_ACCOUNT_TYPES = ['FORCE_ACCOUNT_LABOR', 'FORCE_ACCOUNT_PRIME_EQUIPMENT', 'FORCE_ACCOUNT_EQUIPMENT'];
const DAILY_REPORT_FIELDS = [
  'crew_roster',
  'contract_work_performed',
  'delays_and_reason',
  'extra_work_force_account',
  'equipment_table',
];

// Plausible date bounds for this job. 3 known source rows fall outside this range (2002, 2002,
// 2014) due to upstream extraction artifacts; anything outside is quarantined, not coerced.
const MIN_YEAR = 2020;
const MAX_YEAR = 2027;

interface RawCostTransaction {
  txn_id: string;
  txn_type: string;
  txn_date: string | null;
  resource: string | null;
  classification: string | null;
  quantity: string | null;
  unit: string | null;
  rate: string | null;
  amount: string | null;
  cost_code: string | null;
  fa_no: string | null;
  work_description: string | null;
  vendor_or_sub: string | null;
  source_doc_id: string | null;
  locator: string | null;
  verbatim_line: string | null;
}

interface RawDailyReport {
  dr_id: string;
  report_date: string | null;
  date_agreement: string | null;
  contractor: string | null;
  location_: string | null;
  inspector: string | null;
  relative_path: string | null;
  filename: string | null;
}

interface RawDailyReportField {
  dr_id: string;
  field: string;
  value_: string | null;
}

function parseNumeric(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? trimmed : null;
}

// Normalizes an M/D/YYYY txn_date and classifies it as quarantined if unparseable or outside
// this job's plausible range.
function normalizeTxnDate(raw: string | null): { date: string | null; quarantined: boolean; reason: string | null } {
  if (raw === null || raw.trim() === '') {
    return { date: null, quarantined: true, reason: 'txn_date is missing' };
  }
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!m) {
    return { date: null, quarantined: true, reason: `Unparseable txn_date: "${raw}"` };
  }
  const [, mm, dd, yyyy] = m;
  const year = parseInt(yyyy, 10);
  const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  if (year < MIN_YEAR || year > MAX_YEAR) {
    return {
      date: iso,
      quarantined: true,
      reason: `txn_date "${raw}" parses to ${iso}, outside the job's plausible ${MIN_YEAR}-${MAX_YEAR} range`,
    };
  }
  return { date: iso, quarantined: false, reason: null };
}

// classification packs craft and time basis together, e.g. "JW | STRAIGHT_TIME". Some rows omit
// the craft segment entirely and the whole string is just the time basis (e.g. "OVERTIME").
function splitClassification(classification: string | null): { craft: string | null; timeBasis: string | null } {
  if (!classification) return { craft: null, timeBasis: null };
  const parts = classification.split('|').map((s) => s.trim());
  if (parts.length === 2) return { craft: parts[0] || null, timeBasis: parts[1] || null };
  const TIME_BASES = new Set(['STRAIGHT_TIME', 'OVERTIME', 'DOUBLE_TIME']);
  if (TIME_BASES.has(classification.trim())) return { craft: null, timeBasis: classification.trim() };
  return { craft: classification.trim() || null, timeBasis: null };
}

async function fetchForceAccountTransactions(azurePool: pg.Pool): Promise<RawCostTransaction[]> {
  const { rows } = await azurePool.query<RawCostTransaction>(
    `SELECT txn_id, txn_type, txn_date, resource, classification, quantity, unit, rate, amount,
            cost_code, fa_no, work_description, vendor_or_sub, source_doc_id, locator, verbatim_line
     FROM cost_transaction
     WHERE txn_type = ANY($1)`,
    [FORCE_ACCOUNT_TYPES],
  );
  return rows;
}

async function fetchInspectorDailyReports(azurePool: pg.Pool): Promise<{
  reports: RawDailyReport[];
  fields: RawDailyReportField[];
}> {
  const [reportsRes, fieldsRes] = await Promise.all([
    azurePool.query<RawDailyReport>(
      `SELECT dr_id, report_date::text, date_agreement, contractor, location_, inspector, relative_path, filename
       FROM daily_report`,
    ),
    azurePool.query<RawDailyReportField>(
      `SELECT dr_id, field, value_
       FROM daily_report_field
       WHERE field = ANY($1)`,
      [DAILY_REPORT_FIELDS],
    ),
  ]);
  return { reports: reportsRes.rows, fields: fieldsRes.rows };
}

// AZURE_DATABASE_CONNECTION_STRING is a libpq keyword/value string ("host=... port=... dbname=...
// user=... password=... sslmode=require"), which `psql` reads natively but which the `pg` npm
// package's connectionString parser mis-parses (it expects a postgres:// URI and silently
// mangles keyword/value input). Parse it into a discrete config object instead.
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
    // Azure's managed Postgres presents a publicly-trusted certificate chain, so the default
    // Node TLS trust store validates it -- no need to disable peer verification.
    ssl: config.sslmode && config.sslmode !== 'disable' ? true : undefined,
  };
}

async function stageLaborHours(projectId: string, dryRun: boolean) {
  const azurePool = new pg.Pool({
    ...parseKeywordValueConnectionString(process.env.AZURE_DATABASE_CONNECTION_STRING || ''),
    max: 4,
  });

  try {
    // --- Source 1: force-account labor/equipment transactions ---
    const rawTxns = await fetchForceAccountTransactions(azurePool);
    console.log(`Read ${rawTxns.length} force-account transactions from Azure.`);

    let quarantinedCount = 0;
    const txnInserts: (typeof forceAccountTransactions.$inferInsert)[] = [];
    for (const raw of rawTxns) {
      const { date, quarantined, reason } = normalizeTxnDate(raw.txn_date);
      const { craft, timeBasis } = splitClassification(raw.classification);
      if (quarantined) quarantinedCount++;
      txnInserts.push({
        projectId,
        txnId: raw.txn_id,
        txnType: raw.txn_type,
        txnDateRaw: raw.txn_date ?? '',
        txnDate: date,
        resource: raw.resource || null,
        classification: raw.classification || null,
        craft,
        timeBasis,
        quantity: parseNumeric(raw.quantity),
        unit: raw.unit || null,
        rate: parseNumeric(raw.rate),
        amount: parseNumeric(raw.amount),
        costCode: raw.cost_code || null,
        faNo: raw.fa_no || null,
        workDescription: raw.work_description || null,
        vendorOrSub: raw.vendor_or_sub || null,
        sourceDocId: raw.source_doc_id || null,
        locator: raw.locator || null,
        verbatimLine: raw.verbatim_line || null,
        quarantined,
        quarantineReason: reason,
        sourceSystem: 'azure_claims_db:cost_transaction',
      });
    }

    const byType = new Map<string, { count: number; hours: number }>();
    for (const t of txnInserts) {
      const entry = byType.get(t.txnType) ?? { count: 0, hours: 0 };
      entry.count++;
      if (t.unit === 'HR' && t.quantity) entry.hours += Number(t.quantity);
      byType.set(t.txnType, entry);
    }
    console.log('\nForce-account transactions by type:');
    for (const [type, { count, hours }] of byType) {
      console.log(`  ${type}: ${count} rows, ${hours.toFixed(1)} hours`);
    }
    console.log(`Quarantined (unparseable/out-of-range date): ${quarantinedCount} of ${txnInserts.length}`);

    // --- Source 2: inspector daily reports ---
    const { reports, fields } = await fetchInspectorDailyReports(azurePool);
    console.log(`\nRead ${reports.length} daily_report rows and ${fields.length} matching daily_report_field rows from Azure.`);

    const fieldsByDrId = new Map<string, Map<string, string | null>>();
    for (const f of fields) {
      if (!fieldsByDrId.has(f.dr_id)) fieldsByDrId.set(f.dr_id, new Map());
      fieldsByDrId.get(f.dr_id)!.set(f.field, f.value_);
    }

    let crewCountParsed = 0;
    let crewCountUnparseable = 0;
    const reportInserts: (typeof inspectorDailyReports.$inferInsert)[] = [];
    for (const r of reports) {
      const fieldMap = fieldsByDrId.get(r.dr_id) ?? new Map<string, string | null>();
      const crewRosterRaw = fieldMap.get('crew_roster');
      let crewCount: number | null = null;
      if (crewRosterRaw !== undefined && crewRosterRaw !== null && crewRosterRaw.trim() !== '') {
        const n = Number(crewRosterRaw.trim());
        if (Number.isInteger(n)) {
          crewCount = n;
          crewCountParsed++;
        } else {
          crewCountUnparseable++;
        }
      }

      reportInserts.push({
        projectId,
        azureDrId: r.dr_id,
        reportDate: r.report_date,
        dateAgreement: r.date_agreement || null,
        contractor: r.contractor || null,
        location: r.location_ || null,
        inspector: r.inspector || null,
        crewCount,
        contractWorkPerformed: fieldMap.get('contract_work_performed') || null,
        delaysAndReason: fieldMap.get('delays_and_reason') || null,
        extraWorkForceAccount: fieldMap.get('extra_work_force_account') || null,
        equipmentTable: fieldMap.get('equipment_table') || null,
        sourceFile: [r.relative_path, r.filename].filter(Boolean).join(' / ') || null,
      });
    }
    console.log(`Crew counts parsed: ${crewCountParsed}; non-numeric crew_roster values skipped: ${crewCountUnparseable}.`);

    if (dryRun) {
      console.log('\nDry run: no database changes made.');
      return;
    }

    // Delete-and-reload runs in one transaction so a failure partway through an insert batch
    // rolls back the deletes too, rather than leaving the project with partially staged data.
    await db.transaction(async (tx) => {
      await tx.delete(forceAccountTransactions).where(eq(forceAccountTransactions.projectId, projectId));
      await tx.delete(inspectorDailyReports).where(eq(inspectorDailyReports.projectId, projectId));

      for (let i = 0; i < txnInserts.length; i += 200) {
        await tx.insert(forceAccountTransactions).values(txnInserts.slice(i, i + 200));
      }
      for (let i = 0; i < reportInserts.length; i += 200) {
        await tx.insert(inspectorDailyReports).values(reportInserts.slice(i, i + 200));
      }
    });

    console.log(
      `\nInserted ${txnInserts.length} force-account transaction rows and ${reportInserts.length} inspector daily report rows.`,
    );
  } finally {
    await azurePool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const projectId = args.find((a) => !a.startsWith('--'));
  if (!projectId) {
    console.error('Usage: npx tsx scripts/stage-labor-hours.ts <projectId> [--dry-run]');
    process.exit(1);
  }
  const [project] = await db.select().from(delayAnalysisProjects).where(eq(delayAnalysisProjects.id, projectId));
  if (!project) {
    console.error(`No delay_analysis_projects row found for id ${projectId}`);
    process.exit(1);
  }
  console.log(`${dryRun ? '[DRY RUN] ' : ''}Staging into project: ${project.name} (${project.id})`);

  await stageLaborHours(projectId, dryRun);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
