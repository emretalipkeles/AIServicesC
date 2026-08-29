// Measured Mile metric engine -- a pure domain calculator with NO database access. Every branch
// here must be unit-testable against hand-checked figures. See __tests__/MeasuredMileCalculator.test.ts.
//
// This module deliberately keeps all math and classification logic in one place so a rendered
// number and its provenance can never drift apart: the query handler that calls `compute()` reads
// the exact same rows it hands to the calculator, and returns them (via buildProvenance in the
// handler) as the `provenance` block alongside the series.

export type QuantityDeltaSource = 'direct' | 'derived_from_to_date' | 'not_reported' | 'unavailable';

export type PeriodClass = 'impact' | 'measured_mile' | 'acceleration' | 'neutral' | 'gap';

export type PeriodQualityStatus =
  | 'exact'
  | 'minor_discrepancy'
  | 'significant_discrepancy'
  | 'unvalidated'
  | 'unrecoverable';

/** One row of `bid_item_progress_estimates` for the selected item, for a single pay-estimate period. */
export interface RawProgressRow {
  peNumber: number;
  quantityThisEstimate: number | null;
  quantityToDate: number | null;
  amountDueThisEstimate: number | null;
}

/** The `pay_estimate_periods` data-quality companion row -- exists for every PE 1..N, even unrecoverable ones. */
export interface PeriodQuality {
  peNumber: number;
  status: PeriodQualityStatus;
  cutoffDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  toDateDeltaPct: number | null;
  notes: string | null;
  sourceFile: string;
}

/** Delay-event overlap, already bucketed to a period by the repository/handler (date-range join). */
export interface PeriodImpact {
  peNumber: number;
  impactHours: number;
  eventIds: string[];
}

/** Tier-3 daily/location proxy: crew-days x shift-hours for this item's crosswalked cost codes, in this period. */
export interface PeriodLaborProxy {
  peNumber: number;
  actualProxyHours: number;
  podReportCount: number;
  /** Distinct POD document filenames that contributed crew-days to this period's proxy figure. */
  podSourceDocuments?: string[];
}

export interface MeasuredMileWindowRange {
  startPeNumber: number;
  endPeNumber: number;
}

export interface MeasuredMileCalculatorInput {
  itemNo: number;
  manHoursPerUnit: number | null;
  /** Every pay-estimate period 1..N for the project, in ascending order -- including unrecoverable ones. */
  periodQualities: PeriodQuality[];
  /** This item's own progress rows, keyed implicitly by peNumber (may be sparse). */
  progressRows: RawProgressRow[];
  impactByPeriod: Map<number, PeriodImpact>;
  laborProxyByPeriod: Map<number, PeriodLaborProxy>;
  manualAccelerationPeNumbers: Set<number>;
  measuredMileOverride: MeasuredMileWindowRange | null;
  minMeasuredMileRunLength?: number;
}

export interface MetricPoint {
  peNumber: number;
  cutoffDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  workingDays: number | null;
  isGap: boolean;
  gapReason: string | null;
  installedQuantity: number | null;
  quantityDeltaSource: QuantityDeltaSource;
  earnedManHours: number | null;
  earnedManHoursPerDay: number | null;
  productionRatePerDay: number | null;
  earnedDollars: number | null;
  actualProxyHours: number | null;
  /** POD document filenames that contributed to actualProxyHours this period (empty when no proxy data). */
  actualProxySourceDocuments: string[];
  productivityIndex: number | null; // proxy: earnedManHours / actualProxyHours
  dataQualityStatus: PeriodQualityStatus;
  dataQualityDeltaPct: number | null;
  dataQualityNotes: string | null;
  dataQualitySourceFile: string;
  periodClass: PeriodClass;
  impactHours: number;
  impactEventIds: string[];
  isManualAcceleration: boolean;
}

export interface MeasuredMileWindow {
  startPeNumber: number;
  endPeNumber: number;
  periodCount: number;
  avgProductionRatePerDay: number | null;
  avgEarnedManHoursPerDay: number | null;
  isAutoSelected: boolean;
}

export interface LossStatistics {
  measuredMileBaselineRatePerDay: number | null;
  impactedAverageRatePerDay: number | null;
  productionRateLossPct: number | null;
  measuredMileProductivityIndex: number | null;
  impactedProductivityIndex: number | null;
  productivityIndexLossPct: number | null;
  estimatedLostManHours: number | null;
  impactedQuantityTotal: number | null;
  hasProxyData: boolean;
}

export interface MeasuredMileResult {
  itemNo: number;
  manHoursPerUnit: number | null;
  points: MetricPoint[];
  measuredMileWindow: MeasuredMileWindow | null;
  lossStatistics: LossStatistics;
}

const DEFAULT_MIN_RUN_LENGTH = 3;

export class MeasuredMileCalculator {
  /**
   * Derives the quantity installed in a single period.
   * Priority: direct `quantityThisEstimate` -> derived from the delta of `quantityToDate` against
   * the previous period's cumulative total -> not_reported (item absent from this period's export,
   * treated as zero for chart continuity) -> unavailable (no data at all, e.g. unrecoverable period).
   */
  static deriveInstalledQuantity(
    row: RawProgressRow | undefined,
    previousCumulativeQuantityToDate: number | null
  ): { value: number | null; source: QuantityDeltaSource } {
    if (!row) {
      return { value: 0, source: 'not_reported' };
    }
    if (row.quantityThisEstimate !== null && row.quantityThisEstimate !== undefined) {
      return { value: row.quantityThisEstimate, source: 'direct' };
    }
    if (
      row.quantityToDate !== null &&
      row.quantityToDate !== undefined &&
      previousCumulativeQuantityToDate !== null
    ) {
      return { value: row.quantityToDate - previousCumulativeQuantityToDate, source: 'derived_from_to_date' };
    }
    return { value: null, source: 'unavailable' };
  }

  /** Inclusive calendar-day span between two ISO ("YYYY-MM-DD") date strings. */
  static computeWorkingDays(periodStart: string | null, periodEnd: string | null): number | null {
    if (!periodStart || !periodEnd) return null;
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const diffMs = end.getTime() - start.getTime();
    const days = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
    return days > 0 ? days : null;
  }

  static compute(input: MeasuredMileCalculatorInput): MeasuredMileResult {
    const minRunLength = input.minMeasuredMileRunLength ?? DEFAULT_MIN_RUN_LENGTH;
    const points = this.buildMetricPoints(input);
    const window = this.selectMeasuredMileWindow(points, input.measuredMileOverride, minRunLength);
    const classified = this.applyClassification(points, window, input.manualAccelerationPeNumbers);
    const lossStatistics = this.computeLossStatistics(classified, window);

    return {
      itemNo: input.itemNo,
      manHoursPerUnit: input.manHoursPerUnit,
      points: classified,
      measuredMileWindow: window,
      lossStatistics,
    };
  }

  private static buildMetricPoints(input: MeasuredMileCalculatorInput): MetricPoint[] {
    const progressByPe = new Map(input.progressRows.map((r) => [r.peNumber, r]));
    const sortedQualities = [...input.periodQualities].sort((a, b) => a.peNumber - b.peNumber);

    let previousCumulative: number | null = null;
    const points: MetricPoint[] = [];

    for (const quality of sortedQualities) {
      const row = progressByPe.get(quality.peNumber);

      if (quality.status === 'unrecoverable') {
        points.push({
          peNumber: quality.peNumber,
          cutoffDate: quality.cutoffDate,
          periodStart: quality.periodStart,
          periodEnd: quality.periodEnd,
          workingDays: null,
          isGap: true,
          gapReason: quality.notes || 'No item-level detail could be recovered for this pay-estimate period.',
          installedQuantity: null,
          quantityDeltaSource: 'unavailable',
          earnedManHours: null,
          earnedManHoursPerDay: null,
          productionRatePerDay: null,
          earnedDollars: null,
          actualProxyHours: null,
          actualProxySourceDocuments: [],
          productivityIndex: null,
          dataQualityStatus: quality.status,
          dataQualityDeltaPct: quality.toDateDeltaPct,
          dataQualityNotes: quality.notes,
          dataQualitySourceFile: quality.sourceFile,
          periodClass: 'gap',
          impactHours: 0,
          impactEventIds: [],
          isManualAcceleration: false,
        });
        // Do not update previousCumulative: the cumulative trail is broken here, so the next
        // available period must fall back to 'unavailable' rather than a wrong derived delta.
        previousCumulative = null;
        continue;
      }

      const { value: installedQuantity, source: quantityDeltaSource } = this.deriveInstalledQuantity(
        row,
        previousCumulative
      );

      if (row?.quantityToDate !== null && row?.quantityToDate !== undefined) {
        previousCumulative = row.quantityToDate;
      }

      const workingDays = this.computeWorkingDays(quality.periodStart, quality.periodEnd);
      const earnedManHours =
        installedQuantity !== null && input.manHoursPerUnit !== null
          ? installedQuantity * input.manHoursPerUnit
          : null;
      const productionRatePerDay =
        installedQuantity !== null && workingDays ? installedQuantity / workingDays : null;
      const earnedManHoursPerDay = earnedManHours !== null && workingDays ? earnedManHours / workingDays : null;

      const proxy = input.laborProxyByPeriod.get(quality.peNumber);
      const actualProxyHours = proxy?.actualProxyHours ?? null;
      const actualProxySourceDocuments = proxy?.podSourceDocuments ?? [];
      const productivityIndex =
        earnedManHours !== null && actualProxyHours !== null && actualProxyHours > 0
          ? earnedManHours / actualProxyHours
          : null;

      const impact = input.impactByPeriod.get(quality.peNumber);

      points.push({
        peNumber: quality.peNumber,
        cutoffDate: quality.cutoffDate,
        periodStart: quality.periodStart,
        periodEnd: quality.periodEnd,
        workingDays,
        isGap: false,
        gapReason: null,
        installedQuantity,
        quantityDeltaSource,
        earnedManHours,
        earnedManHoursPerDay,
        productionRatePerDay,
        earnedDollars: row?.amountDueThisEstimate ?? null,
        actualProxyHours,
        actualProxySourceDocuments,
        productivityIndex,
        dataQualityStatus: quality.status,
        dataQualityDeltaPct: quality.toDateDeltaPct,
        dataQualityNotes: quality.notes,
        dataQualitySourceFile: quality.sourceFile,
        periodClass: 'neutral',
        impactHours: impact?.impactHours ?? 0,
        impactEventIds: impact?.eventIds ?? [],
        isManualAcceleration: input.manualAccelerationPeNumbers.has(quality.peNumber),
      });
    }

    return points;
  }

  /**
   * Picks the measured-mile window: the maximal run of consecutive, unimpacted, non-gap periods
   * with real production that sustains the highest average production rate. Runs break at any gap
   * or impacted period (adjacency is over eligible points, not raw PE numbers). Falls back to a
   * shorter minimum run length if no run of the requested length exists, down to a single period.
   */
  private static selectMeasuredMileWindow(
    points: MetricPoint[],
    override: MeasuredMileWindowRange | null,
    minRunLength: number
  ): MeasuredMileWindow | null {
    if (override) {
      const inRange = points.filter(
        (p) => p.peNumber >= override.startPeNumber && p.peNumber <= override.endPeNumber && !p.isGap
      );
      if (inRange.length === 0) return null;
      return {
        startPeNumber: override.startPeNumber,
        endPeNumber: override.endPeNumber,
        periodCount: inRange.length,
        avgProductionRatePerDay: this.average(inRange.map((p) => p.productionRatePerDay)),
        avgEarnedManHoursPerDay: this.average(inRange.map((p) => p.earnedManHoursPerDay)),
        isAutoSelected: false,
      };
    }

    const isEligible = (p: MetricPoint) =>
      !p.isGap && !p.isManualAcceleration && p.impactEventIds.length === 0 && (p.installedQuantity ?? 0) > 0;

    const runs: MetricPoint[][] = [];
    let currentRun: MetricPoint[] = [];
    for (const p of points) {
      if (isEligible(p)) {
        currentRun.push(p);
      } else {
        if (currentRun.length > 0) runs.push(currentRun);
        currentRun = [];
      }
    }
    if (currentRun.length > 0) runs.push(currentRun);

    for (let requiredLength = minRunLength; requiredLength >= 1; requiredLength--) {
      const candidates = runs.filter((r) => r.length >= requiredLength);
      if (candidates.length === 0) continue;

      let best: MetricPoint[] | null = null;
      let bestRate = -Infinity;
      for (const run of candidates) {
        const rate = this.average(run.map((p) => p.productionRatePerDay)) ?? -Infinity;
        if (
          rate > bestRate ||
          (rate === bestRate && best !== null && run.length > best.length)
        ) {
          best = run;
          bestRate = rate;
        }
      }

      if (best) {
        return {
          startPeNumber: best[0].peNumber,
          endPeNumber: best[best.length - 1].peNumber,
          periodCount: best.length,
          avgProductionRatePerDay: this.average(best.map((p) => p.productionRatePerDay)),
          avgEarnedManHoursPerDay: this.average(best.map((p) => p.earnedManHoursPerDay)),
          isAutoSelected: true,
        };
      }
    }

    return null;
  }

  private static applyClassification(
    points: MetricPoint[],
    window: MeasuredMileWindow | null,
    manualAccelerationPeNumbers: Set<number>
  ): MetricPoint[] {
    return points.map((p) => {
      if (p.isGap) return { ...p, periodClass: 'gap' as PeriodClass };
      if (manualAccelerationPeNumbers.has(p.peNumber)) {
        return { ...p, periodClass: 'acceleration' as PeriodClass, isManualAcceleration: true };
      }
      if (window && p.peNumber >= window.startPeNumber && p.peNumber <= window.endPeNumber) {
        return { ...p, periodClass: 'measured_mile' as PeriodClass };
      }
      if (p.impactEventIds.length > 0) {
        return { ...p, periodClass: 'impact' as PeriodClass };
      }
      return { ...p, periodClass: 'neutral' as PeriodClass };
    });
  }

  /**
   * Estimated lost man-hours uses the proxy "actual hours per unit" (actualProxyHours /
   * installedQuantity) as the true unit rate -- earned man-hours is a fixed budgeted multiple of
   * quantity, so it cannot itself show a change in efficiency. Sign convention: a period that took
   * MORE actual hours per unit than the measured-mile baseline produces a POSITIVE lost-hours
   * figure (impactedUnitRate - baselineUnitRate) x impacted quantity. Proxy-only; flagged in the UI.
   */
  private static computeLossStatistics(points: MetricPoint[], window: MeasuredMileWindow | null): LossStatistics {
    const measuredMilePoints = window
      ? points.filter((p) => !p.isGap && p.peNumber >= window.startPeNumber && p.peNumber <= window.endPeNumber)
      : [];
    const impactPoints = points.filter((p) => p.periodClass === 'impact');

    const measuredMileBaselineRatePerDay = this.average(measuredMilePoints.map((p) => p.productionRatePerDay));
    const impactedAverageRatePerDay = this.average(impactPoints.map((p) => p.productionRatePerDay));
    const productionRateLossPct =
      measuredMileBaselineRatePerDay && measuredMileBaselineRatePerDay > 0 && impactedAverageRatePerDay !== null
        ? (measuredMileBaselineRatePerDay - impactedAverageRatePerDay) / measuredMileBaselineRatePerDay
        : null;

    const measuredMileProductivityIndex = this.average(measuredMilePoints.map((p) => p.productivityIndex));
    const impactedProductivityIndex = this.average(impactPoints.map((p) => p.productivityIndex));
    const productivityIndexLossPct =
      measuredMileProductivityIndex && measuredMileProductivityIndex > 0 && impactedProductivityIndex !== null
        ? (measuredMileProductivityIndex - impactedProductivityIndex) / measuredMileProductivityIndex
        : null;

    const unitRateOf = (p: MetricPoint): number | null =>
      p.actualProxyHours !== null && p.installedQuantity !== null && p.installedQuantity > 0
        ? p.actualProxyHours / p.installedQuantity
        : null;

    const baselineUnitRate = this.average(measuredMilePoints.map(unitRateOf));
    const impactedUnitRate = this.average(impactPoints.map(unitRateOf));
    const impactedQuantityTotal = impactPoints.some((p) => p.installedQuantity !== null)
      ? impactPoints.reduce((sum, p) => sum + (p.installedQuantity ?? 0), 0)
      : null;

    const estimatedLostManHours =
      baselineUnitRate !== null && impactedUnitRate !== null && impactedQuantityTotal !== null
        ? impactedQuantityTotal * (impactedUnitRate - baselineUnitRate)
        : null;

    const hasProxyData = points.some((p) => p.actualProxyHours !== null);

    return {
      measuredMileBaselineRatePerDay,
      impactedAverageRatePerDay,
      productionRateLossPct,
      measuredMileProductivityIndex,
      impactedProductivityIndex,
      productivityIndexLossPct,
      estimatedLostManHours,
      impactedQuantityTotal,
      hasProxyData,
    };
  }

  private static average(values: Array<number | null | undefined>): number | null {
    const nums = values.filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
    if (nums.length === 0) return null;
    return nums.reduce((sum, v) => sum + v, 0) / nums.length;
  }
}
