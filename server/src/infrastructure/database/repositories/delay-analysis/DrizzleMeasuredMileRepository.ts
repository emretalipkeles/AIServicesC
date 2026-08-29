import { eq, and, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '../../../database';
import {
  bidItemProgressEstimates,
  bidItemLaborEstimates,
  bidItemCostEstimateLines,
  payEstimatePeriods,
  contractorDelayEvents,
  scheduleActivities,
  podReports,
  podSections,
  podCrewMembers,
  podTaskLines,
  diaryReports,
  diaryEntries,
  forceAccountTransactions,
  payrollJobLaborEntries,
  measuredMilePeriodTags,
  measuredMileWindowOverrides,
  projectDocuments,
} from '@shared/schema';
import type {
  IMeasuredMileRepository,
  EligibleBidItem,
  DelayEventFilterOptions,
  MeasuredMileInputBundle,
  DelayEventSummaryForPeriod,
  ScheduleActivitySummaryForPeriod,
  DiaryContextForPeriod,
  PodContextForPeriod,
} from '../../../../domain/delay-analysis/repositories/IMeasuredMileRepository';
import type {
  PeriodQuality,
  RawProgressRow,
  PeriodImpact,
  PeriodLaborProxy,
  MeasuredMileWindowRange,
  PeriodQualityStatus,
} from '../../../../domain/measured-mile/MeasuredMileCalculator';
import type { JobWidePeriodInput } from '../../../../domain/measured-mile/JobWideProductivityCalculator';

// Units that never represent measurable per-unit direct-work production.
const EXCLUDED_UNITS = new Set(['LS', 'FA']);

// Description keywords for named indirect/overhead items called out in the task spec
// (mobilization, quality program, traffic control, surveying, vibration/noise monitoring,
// schedule updates) -- matched case-insensitively as substrings since bid item wording varies
// slightly across the contract documents.
const EXCLUDED_DESCRIPTION_KEYWORDS = [
  'mobilization',
  'quality program',
  'traffic control',
  'maintenance and protection of traffic',
  'survey',
  'vibration monitoring',
  'noise mitigation',
  'schedule update',
];

function isExcludedItem(units: string | null, description: string | null): boolean {
  if (units && EXCLUDED_UNITS.has(units.toUpperCase())) return true;
  if (description) {
    const lower = description.toLowerCase();
    if (EXCLUDED_DESCRIPTION_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  }
  return false;
}

function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? null : n;
}

/** Normalizes a bid-item cost sub-activity code ("099.01") to POD's cost-code zero-padding ("99.01"). */
function normalizeCostCode(code: string): string {
  const trimmed = code.trim();
  const match = trimmed.match(/^0*(\d+)(\..*)?$/);
  if (!match) return trimmed;
  return match[2] ? `${match[1]}${match[2]}` : match[1];
}

function toIsoDate(d: Date | string | null): string | null {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function overlapsRange(
  itemStart: string | null,
  itemEnd: string | null,
  rangeStart: string | null,
  rangeEnd: string | null
): boolean {
  if (!itemStart || !rangeStart || !rangeEnd) return false;
  const effectiveEnd = itemEnd || itemStart;
  return itemStart <= rangeEnd && effectiveEnd >= rangeStart;
}

export class DrizzleMeasuredMileRepository implements IMeasuredMileRepository {
  async getEligibleBidItems(projectId: string, tenantId: string): Promise<EligibleBidItem[]> {
    const progressRows = await db
      .select({
        itemNo: bidItemProgressEstimates.itemNo,
        peNumber: bidItemProgressEstimates.peNumber,
        description: bidItemProgressEstimates.description,
        units: bidItemProgressEstimates.units,
        unitPrice: bidItemProgressEstimates.unitPrice,
        contractQuantity: bidItemProgressEstimates.contractQuantity,
        quantityThisEstimate: bidItemProgressEstimates.quantityThisEstimate,
        quantityToDate: bidItemProgressEstimates.quantityToDate,
      })
      .from(bidItemProgressEstimates)
      .where(
        and(eq(bidItemProgressEstimates.projectId, projectId), eq(bidItemProgressEstimates.tenantId, tenantId))
      );

    type Agg = {
      itemNo: number;
      description: string | null;
      units: string | null;
      unitPrice: number | null;
      contractQuantity: number | null;
      periodsWithProduction: number;
    };
    const byItem = new Map<number, Agg>();

    for (const row of progressRows) {
      if (row.itemNo === null || row.itemNo === undefined) continue;
      let agg = byItem.get(row.itemNo);
      if (!agg) {
        agg = {
          itemNo: row.itemNo,
          description: null,
          units: null,
          unitPrice: null,
          contractQuantity: null,
          periodsWithProduction: 0,
        };
        byItem.set(row.itemNo, agg);
      }
      if (row.description) agg.description = row.description;
      if (row.units) agg.units = row.units;
      const unitPrice = toNum(row.unitPrice);
      if (unitPrice !== null) agg.unitPrice = unitPrice;
      const contractQuantity = toNum(row.contractQuantity);
      if (contractQuantity !== null) agg.contractQuantity = contractQuantity;

      const qty = toNum(row.quantityThisEstimate);
      if (qty !== null && qty !== 0) agg.periodsWithProduction += 1;
    }

    const manHoursByItem = await this.getManHoursPerUnitMap(projectId, tenantId);

    const results: EligibleBidItem[] = [];
    for (const agg of Array.from(byItem.values())) {
      if (isExcludedItem(agg.units, agg.description)) continue;
      const manHoursPerUnit = manHoursByItem.get(agg.itemNo) ?? null;
      const contractDollars =
        agg.unitPrice !== null && agg.contractQuantity !== null ? agg.unitPrice * agg.contractQuantity : null;
      const budgetedManHours =
        manHoursPerUnit !== null && agg.contractQuantity !== null ? manHoursPerUnit * agg.contractQuantity : null;

      results.push({
        itemNo: agg.itemNo,
        description: agg.description,
        units: agg.units,
        unitPrice: agg.unitPrice,
        contractQuantity: agg.contractQuantity,
        contractDollars,
        manHoursPerUnit,
        budgetedManHours,
        periodsWithProduction: agg.periodsWithProduction,
      });
    }

    return results.sort((a, b) => a.itemNo - b.itemNo);
  }

  /** Coalesces bid_item_labor_estimates' known duplicate rows per itemNo (one null-MH, one real). */
  private async getManHoursPerUnitMap(projectId: string, tenantId: string): Promise<Map<number, number>> {
    const rows = await db
      .select({ itemNo: bidItemLaborEstimates.itemNo, estimatedManHours: bidItemLaborEstimates.estimatedManHours })
      .from(bidItemLaborEstimates)
      .where(and(eq(bidItemLaborEstimates.projectId, projectId), eq(bidItemLaborEstimates.tenantId, tenantId)));

    const map = new Map<number, number>();
    for (const row of rows) {
      const mh = toNum(row.estimatedManHours);
      if (mh === null) continue;
      const existing = map.get(row.itemNo);
      if (existing === undefined || mh > existing) map.set(row.itemNo, mh);
    }
    return map;
  }

  async getManHoursPerUnit(projectId: string, tenantId: string, itemNo: number): Promise<number | null> {
    const map = await this.getManHoursPerUnitMap(projectId, tenantId);
    return map.get(itemNo) ?? null;
  }

  async getPeriodQualities(projectId: string, tenantId: string): Promise<PeriodQuality[]> {
    const rows = await db
      .select()
      .from(payEstimatePeriods)
      .where(and(eq(payEstimatePeriods.projectId, projectId), eq(payEstimatePeriods.tenantId, tenantId)));

    return rows
      .map((r) => ({
        peNumber: r.peNumber,
        status: r.status as PeriodQualityStatus,
        cutoffDate: r.cutoffDate,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        toDateDeltaPct: toNum(r.toDateDeltaPct),
        notes: r.notes,
        sourceFile: r.sourceFile,
      }))
      .sort((a, b) => a.peNumber - b.peNumber);
  }

  async getProgressRows(projectId: string, tenantId: string, itemNo: number): Promise<RawProgressRow[]> {
    const rows = await db
      .select()
      .from(bidItemProgressEstimates)
      .where(
        and(
          eq(bidItemProgressEstimates.projectId, projectId),
          eq(bidItemProgressEstimates.tenantId, tenantId),
          eq(bidItemProgressEstimates.itemNo, itemNo)
        )
      );

    return rows.map((r) => ({
      peNumber: r.peNumber,
      quantityThisEstimate: toNum(r.quantityThisEstimate),
      quantityToDate: toNum(r.quantityToDate),
      amountDueThisEstimate: toNum(r.amountDueThisEstimate),
    }));
  }

  async getImpactByPeriod(
    projectId: string,
    tenantId: string,
    periods: PeriodQuality[],
    options: DelayEventFilterOptions
  ): Promise<Map<number, PeriodImpact>> {
    const conditions = [eq(contractorDelayEvents.projectId, projectId), eq(contractorDelayEvents.tenantId, tenantId)];
    if (options.verifiedOnly) {
      conditions.push(eq(contractorDelayEvents.verificationStatus, 'verified'));
    }
    if (options.wbsCodes && options.wbsCodes.length > 0) {
      conditions.push(inArray(contractorDelayEvents.wbs, options.wbsCodes));
    }

    const events = await db
      .select({
        id: contractorDelayEvents.id,
        eventStartDate: contractorDelayEvents.eventStartDate,
        eventFinishDate: contractorDelayEvents.eventFinishDate,
        impactDurationHours: contractorDelayEvents.impactDurationHours,
      })
      .from(contractorDelayEvents)
      .where(and(...conditions));

    const map = new Map<number, PeriodImpact>();
    for (const period of periods) {
      if (period.status === 'unrecoverable') continue;
      let impactHours = 0;
      const eventIds: string[] = [];
      for (const event of events) {
        const start = toIsoDate(event.eventStartDate);
        const end = toIsoDate(event.eventFinishDate) ?? start;
        if (overlapsRange(start, end, period.periodStart, period.periodEnd)) {
          impactHours += event.impactDurationHours ?? 0;
          eventIds.push(event.id);
        }
      }
      if (eventIds.length > 0) {
        map.set(period.peNumber, { peNumber: period.peNumber, impactHours, eventIds });
      }
    }
    return map;
  }

  private async getCrosswalkCostCodes(projectId: string, tenantId: string, itemNo: number): Promise<string[]> {
    const rows = await db
      .select({ subActivityCode: bidItemCostEstimateLines.subActivityCode })
      .from(bidItemCostEstimateLines)
      .where(
        and(
          eq(bidItemCostEstimateLines.projectId, projectId),
          eq(bidItemCostEstimateLines.tenantId, tenantId),
          eq(bidItemCostEstimateLines.bidItemNo, itemNo),
          isNotNull(bidItemCostEstimateLines.subActivityCode)
        )
      );

    const codes = new Set<string>();
    for (const row of rows) {
      if (row.subActivityCode) codes.add(normalizeCostCode(row.subActivityCode));
    }
    return Array.from(codes);
  }

  async getLaborProxyByPeriod(
    projectId: string,
    tenantId: string,
    itemNo: number,
    periods: PeriodQuality[],
    shiftHours: number
  ): Promise<Map<number, PeriodLaborProxy>> {
    const costCodes = await this.getCrosswalkCostCodes(projectId, tenantId, itemNo);
    if (costCodes.length === 0) return new Map();

    // POD's own costCode values aren't zero-padded consistently either; compare normalized forms.
    const allTaskLines = await db
      .select({
        sectionId: podTaskLines.sectionId,
        costCode: podTaskLines.costCode,
      })
      .from(podTaskLines)
      .innerJoin(podSections, eq(podTaskLines.sectionId, podSections.id))
      .innerJoin(podReports, eq(podSections.reportId, podReports.id))
      .where(and(eq(podReports.projectId, projectId), eq(podReports.tenantId, tenantId), isNotNull(podTaskLines.costCode)));

    const codeSet = new Set(costCodes);
    const matchingSectionIds = new Set<string>();
    for (const row of allTaskLines) {
      if (row.costCode && codeSet.has(normalizeCostCode(row.costCode))) {
        matchingSectionIds.add(row.sectionId);
      }
    }
    if (matchingSectionIds.size === 0) return new Map();

    const matchingSectionIdList = Array.from(matchingSectionIds);
    const sectionRows = await db
      .select({
        sectionId: podSections.id,
        reportDate: podReports.reportDate,
        documentName: projectDocuments.filename,
      })
      .from(podSections)
      .innerJoin(podReports, eq(podSections.reportId, podReports.id))
      .innerJoin(projectDocuments, eq(podReports.sourceDocumentId, projectDocuments.id))
      .where(inArray(podSections.id, matchingSectionIdList));

    const crewRows = await db
      .select({ sectionId: podCrewMembers.sectionId, cnt: sql<number>`count(*)`.as('cnt') })
      .from(podCrewMembers)
      .where(inArray(podCrewMembers.sectionId, matchingSectionIdList))
      .groupBy(podCrewMembers.sectionId);

    const crewCountBySection = new Map<string, number>();
    for (const row of crewRows) crewCountBySection.set(row.sectionId, Number(row.cnt));

    const dailyCrewCount = new Map<string, { crewDays: number; reportCount: number; documentNames: Set<string> }>();
    const seenDatePerReport = new Map<string, Set<string>>();
    for (const row of Array.from(sectionRows)) {
      const dateStr = toIsoDate(row.reportDate);
      if (!dateStr) continue;
      const crewCount = crewCountBySection.get(row.sectionId) ?? 0;
      const existing = dailyCrewCount.get(dateStr) ?? { crewDays: 0, reportCount: 0, documentNames: new Set<string>() };
      existing.crewDays += crewCount;
      if (row.documentName) existing.documentNames.add(row.documentName);
      dailyCrewCount.set(dateStr, existing);

      let seenSet = seenDatePerReport.get(dateStr);
      if (!seenSet) {
        seenSet = new Set();
        seenDatePerReport.set(dateStr, seenSet);
      }
      if (!seenSet.has(row.sectionId)) {
        seenSet.add(row.sectionId);
        existing.reportCount += 1;
      }
    }

    const map = new Map<number, PeriodLaborProxy>();
    for (const period of periods) {
      if (period.status === 'unrecoverable' || !period.periodStart || !period.periodEnd) continue;
      let crewDays = 0;
      let podReportCount = 0;
      const documentNames = new Set<string>();
      for (const [dateStr, data] of Array.from(dailyCrewCount.entries())) {
        if (dateStr >= period.periodStart && dateStr <= period.periodEnd) {
          crewDays += data.crewDays;
          podReportCount += data.reportCount;
          for (const name of Array.from(data.documentNames)) documentNames.add(name);
        }
      }
      if (podReportCount > 0) {
        map.set(period.peNumber, {
          peNumber: period.peNumber,
          actualProxyHours: crewDays * shiftHours,
          podReportCount,
          podSourceDocuments: Array.from(documentNames).sort(),
        });
      }
    }
    return map;
  }

  async getManualAccelerationPeNumbers(projectId: string, tenantId: string, itemNo: number): Promise<Set<number>> {
    const rows = await db
      .select({ peNumber: measuredMilePeriodTags.peNumber })
      .from(measuredMilePeriodTags)
      .where(
        and(
          eq(measuredMilePeriodTags.projectId, projectId),
          eq(measuredMilePeriodTags.tenantId, tenantId),
          eq(measuredMilePeriodTags.itemNo, itemNo),
          eq(measuredMilePeriodTags.tag, 'acceleration')
        )
      );
    return new Set(rows.map((r) => r.peNumber));
  }

  async getMeasuredMileOverride(
    projectId: string,
    tenantId: string,
    itemNo: number
  ): Promise<MeasuredMileWindowRange | null> {
    const rows = await db
      .select()
      .from(measuredMileWindowOverrides)
      .where(
        and(
          eq(measuredMileWindowOverrides.projectId, projectId),
          eq(measuredMileWindowOverrides.tenantId, tenantId),
          eq(measuredMileWindowOverrides.itemNo, itemNo)
        )
      )
      .limit(1);
    if (rows.length === 0) return null;
    return { startPeNumber: rows[0].startPeNumber, endPeNumber: rows[0].endPeNumber };
  }

  async setAccelerationTag(
    projectId: string,
    tenantId: string,
    itemNo: number,
    peNumber: number,
    createdBy?: string
  ): Promise<void> {
    await db
      .insert(measuredMilePeriodTags)
      .values({ projectId, tenantId, itemNo, peNumber, tag: 'acceleration', createdBy: createdBy ?? null })
      .onConflictDoNothing();
  }

  async clearAccelerationTag(projectId: string, tenantId: string, itemNo: number, peNumber: number): Promise<void> {
    await db
      .delete(measuredMilePeriodTags)
      .where(
        and(
          eq(measuredMilePeriodTags.projectId, projectId),
          eq(measuredMilePeriodTags.tenantId, tenantId),
          eq(measuredMilePeriodTags.itemNo, itemNo),
          eq(measuredMilePeriodTags.peNumber, peNumber),
          eq(measuredMilePeriodTags.tag, 'acceleration')
        )
      );
  }

  async setMeasuredMileOverride(
    projectId: string,
    tenantId: string,
    itemNo: number,
    range: MeasuredMileWindowRange,
    createdBy?: string
  ): Promise<void> {
    await db
      .insert(measuredMileWindowOverrides)
      .values({
        projectId,
        tenantId,
        itemNo,
        startPeNumber: range.startPeNumber,
        endPeNumber: range.endPeNumber,
        createdBy: createdBy ?? null,
      })
      .onConflictDoUpdate({
        target: [measuredMileWindowOverrides.projectId, measuredMileWindowOverrides.itemNo],
        set: {
          startPeNumber: range.startPeNumber,
          endPeNumber: range.endPeNumber,
          updatedAt: new Date(),
        },
      });
  }

  async clearMeasuredMileOverride(projectId: string, tenantId: string, itemNo: number): Promise<void> {
    await db
      .delete(measuredMileWindowOverrides)
      .where(
        and(
          eq(measuredMileWindowOverrides.projectId, projectId),
          eq(measuredMileWindowOverrides.tenantId, tenantId),
          eq(measuredMileWindowOverrides.itemNo, itemNo)
        )
      );
  }

  async getMeasuredMileInputBundle(
    projectId: string,
    tenantId: string,
    itemNo: number,
    options: DelayEventFilterOptions,
    shiftHours: number
  ): Promise<MeasuredMileInputBundle> {
    const [manHoursPerUnit, periodQualities, progressRows, manualAccelerationPeNumbers, measuredMileOverride] =
      await Promise.all([
        this.getManHoursPerUnit(projectId, tenantId, itemNo),
        this.getPeriodQualities(projectId, tenantId),
        this.getProgressRows(projectId, tenantId, itemNo),
        this.getManualAccelerationPeNumbers(projectId, tenantId, itemNo),
        this.getMeasuredMileOverride(projectId, tenantId, itemNo),
      ]);

    const [impactByPeriod, laborProxyByPeriod, crosswalkCostCodes] = await Promise.all([
      this.getImpactByPeriod(projectId, tenantId, periodQualities, options),
      this.getLaborProxyByPeriod(projectId, tenantId, itemNo, periodQualities, shiftHours),
      this.getCrosswalkCostCodes(projectId, tenantId, itemNo),
    ]);

    return {
      itemNo,
      manHoursPerUnit,
      periodQualities,
      progressRows,
      impactByPeriod,
      laborProxyByPeriod,
      manualAccelerationPeNumbers,
      measuredMileOverride,
      crosswalkCostCodes,
    };
  }

  async getJobWideProductivityInputs(
    projectId: string,
    tenantId: string,
    eligibleItemNos: Set<number>
  ): Promise<JobWidePeriodInput[]> {
    const periods = await this.getPeriodQualities(projectId, tenantId);
    const manHoursByItem = await this.getManHoursPerUnitMap(projectId, tenantId);

    const progressRows = await db
      .select({
        itemNo: bidItemProgressEstimates.itemNo,
        peNumber: bidItemProgressEstimates.peNumber,
        quantityThisEstimate: bidItemProgressEstimates.quantityThisEstimate,
      })
      .from(bidItemProgressEstimates)
      .where(
        and(
          eq(bidItemProgressEstimates.projectId, projectId),
          eq(bidItemProgressEstimates.tenantId, tenantId),
          isNotNull(bidItemProgressEstimates.quantityThisEstimate)
        )
      );

    // Simplification, documented: the job-wide earned-hours reference series sums only the
    // *directly reported* quantityThisEstimate values (skips the to-date-delta fallback the
    // per-item calculator applies) -- this is a secondary/reference metric, not the primary
    // per-item series, and the fallback needs a per-item cumulative walk that isn't worth
    // duplicating here. Per-item series (which IS exact) remains the authoritative numbers.
    const earnedMhByPe = new Map<number, number>();
    for (const row of progressRows) {
      if (row.itemNo === null || !eligibleItemNos.has(row.itemNo)) continue;
      const mh = manHoursByItem.get(row.itemNo);
      const qty = toNum(row.quantityThisEstimate);
      if (mh === undefined || qty === null) continue;
      earnedMhByPe.set(row.peNumber, (earnedMhByPe.get(row.peNumber) ?? 0) + qty * mh);
    }

    const payrollRows = await db
      .select({ payDate: payrollJobLaborEntries.payDate, hours: payrollJobLaborEntries.hours })
      .from(payrollJobLaborEntries)
      .where(
        and(
          eq(payrollJobLaborEntries.projectId, projectId),
          eq(payrollJobLaborEntries.tenantId, tenantId),
          eq(payrollJobLaborEntries.tradeCategory, 'direct'),
          eq(payrollJobLaborEntries.quarantined, false),
          isNotNull(payrollJobLaborEntries.payDate),
          isNotNull(payrollJobLaborEntries.hours)
        )
      );

    const faRows = await db
      .select({ txnDate: forceAccountTransactions.txnDate, quantity: forceAccountTransactions.quantity })
      .from(forceAccountTransactions)
      .where(
        and(
          eq(forceAccountTransactions.projectId, projectId),
          eq(forceAccountTransactions.tenantId, tenantId),
          eq(forceAccountTransactions.txnType, 'FORCE_ACCOUNT_LABOR'),
          eq(forceAccountTransactions.quarantined, false),
          isNotNull(forceAccountTransactions.txnDate)
        )
      );

    const payrollByDate: Array<{ date: string; hours: number }> = payrollRows
      .filter((r) => r.payDate)
      .map((r) => ({ date: r.payDate as string, hours: toNum(r.hours) ?? 0 }));
    const faByDate: Array<{ date: string; hours: number }> = faRows
      .filter((r) => r.txnDate)
      .map((r) => ({ date: r.txnDate as string, hours: toNum(r.quantity) ?? 0 }));

    return periods
      .filter((p) => p.periodStart && p.periodEnd)
      .map((p) => {
        const totalDirectPayrollHours = payrollByDate
          .filter((r) => r.date >= p.periodStart! && r.date <= p.periodEnd!)
          .reduce((sum, r) => sum + r.hours, 0);
        const forceAccountHours = faByDate
          .filter((r) => r.date >= p.periodStart! && r.date <= p.periodEnd!)
          .reduce((sum, r) => sum + r.hours, 0);

        return {
          peNumber: p.peNumber,
          cutoffDate: p.cutoffDate,
          totalEarnedManHours: earnedMhByPe.get(p.peNumber) ?? null,
          totalDirectPayrollHours,
          forceAccountHours,
        };
      });
  }

  async getDelayEventsForPeriod(
    projectId: string,
    tenantId: string,
    periodStart: string | null,
    periodEnd: string | null,
    options: DelayEventFilterOptions
  ): Promise<DelayEventSummaryForPeriod[]> {
    if (!periodStart || !periodEnd) return [];

    const conditions = [eq(contractorDelayEvents.projectId, projectId), eq(contractorDelayEvents.tenantId, tenantId)];
    if (options.verifiedOnly) conditions.push(eq(contractorDelayEvents.verificationStatus, 'verified'));
    if (options.wbsCodes && options.wbsCodes.length > 0) conditions.push(inArray(contractorDelayEvents.wbs, options.wbsCodes));

    const rows = await db.select().from(contractorDelayEvents).where(and(...conditions));

    return rows
      .filter((r) => {
        const start = toIsoDate(r.eventStartDate);
        const end = toIsoDate(r.eventFinishDate) ?? start;
        return overlapsRange(start, end, periodStart, periodEnd);
      })
      .map((r) => ({
        id: r.id,
        eventDescription: r.eventDescription,
        eventCategory: r.eventCategory,
        eventStartDate: toIsoDate(r.eventStartDate),
        eventFinishDate: toIsoDate(r.eventFinishDate),
        impactDurationHours: r.impactDurationHours,
        verificationStatus: r.verificationStatus,
        wbs: r.wbs,
        cpmActivityId: r.cpmActivityId,
      }));
  }

  async getScheduleActivitiesForPeriod(
    projectId: string,
    tenantId: string,
    periodStart: string | null,
    periodEnd: string | null
  ): Promise<ScheduleActivitySummaryForPeriod[]> {
    if (!periodStart || !periodEnd) return [];

    const rows = await db
      .select()
      .from(scheduleActivities)
      .where(and(eq(scheduleActivities.projectId, projectId), eq(scheduleActivities.tenantId, tenantId)));

    return rows
      .filter((r) => {
        const start = toIsoDate(r.actualStartDate);
        const end = toIsoDate(r.actualFinishDate) ?? start;
        return overlapsRange(start, end, periodStart, periodEnd);
      })
      .map((r) => ({
        activityId: r.activityId,
        wbs: r.wbs,
        activityDescription: r.activityDescription,
        isCriticalPath: r.isCriticalPath ?? 'unknown',
        actualStartDate: toIsoDate(r.actualStartDate),
        actualFinishDate: toIsoDate(r.actualFinishDate),
      }));
  }

  async getDiaryContextForPeriod(
    projectId: string,
    tenantId: string,
    periodStart: string | null,
    periodEnd: string | null
  ): Promise<DiaryContextForPeriod[]> {
    if (!periodStart || !periodEnd) return [];

    const rows = await db
      .select({
        reportId: diaryReports.id,
        reportDate: diaryReports.reportDate,
        filename: projectDocuments.filename,
      })
      .from(diaryReports)
      .innerJoin(projectDocuments, eq(diaryReports.sourceDocumentId, projectDocuments.id))
      .where(and(eq(diaryReports.projectId, projectId), eq(diaryReports.tenantId, tenantId)));

    const inRange = rows.filter((r) => {
      const d = toIsoDate(r.reportDate);
      return d !== null && d >= periodStart && d <= periodEnd;
    });
    if (inRange.length === 0) return [];

    const entryCounts = await db
      .select({ reportId: diaryEntries.reportId, cnt: sql<number>`count(*)`.as('cnt') })
      .from(diaryEntries)
      .where(inArray(diaryEntries.reportId, inRange.map((r) => r.reportId)))
      .groupBy(diaryEntries.reportId);
    const countByReport = new Map(entryCounts.map((r) => [r.reportId, Number(r.cnt)]));

    return inRange.map((r) => ({
      reportDate: toIsoDate(r.reportDate)!,
      documentName: r.filename,
      entryCount: countByReport.get(r.reportId) ?? 0,
    }));
  }

  async getPodContextForPeriod(
    projectId: string,
    tenantId: string,
    periodStart: string | null,
    periodEnd: string | null
  ): Promise<PodContextForPeriod[]> {
    if (!periodStart || !periodEnd) return [];

    const rows = await db
      .select({
        reportId: podReports.id,
        reportDate: podReports.reportDate,
        filename: projectDocuments.filename,
      })
      .from(podReports)
      .innerJoin(projectDocuments, eq(podReports.sourceDocumentId, projectDocuments.id))
      .where(and(eq(podReports.projectId, projectId), eq(podReports.tenantId, tenantId)));

    const inRange = rows.filter((r) => {
      const d = toIsoDate(r.reportDate);
      return d !== null && d >= periodStart && d <= periodEnd;
    });
    if (inRange.length === 0) return [];

    const sectionCounts = await db
      .select({ reportId: podSections.reportId, cnt: sql<number>`count(*)`.as('cnt') })
      .from(podSections)
      .where(inArray(podSections.reportId, inRange.map((r) => r.reportId)))
      .groupBy(podSections.reportId);
    const countByReport = new Map(sectionCounts.map((r) => [r.reportId, Number(r.cnt)]));

    return inRange.map((r) => ({
      reportDate: toIsoDate(r.reportDate)!,
      documentName: r.filename,
      crewSectionCount: countByReport.get(r.reportId) ?? 0,
    }));
  }
}
