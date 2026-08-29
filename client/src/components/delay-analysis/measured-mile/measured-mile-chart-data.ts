import { format } from "date-fns";
import type { MetricPointDto, PeriodClass, PointCitationDto } from "@/lib/measured-mile-api";

export type ChartMetric =
  | "productionRatePerDay"
  | "earnedManHoursPerDay"
  | "productivityIndex"
  | "earnedDollars"
  | "cumulativeEarnedDollars"
  | "cumulativeEarnedManHours";

/**
 * How the time axis is drawn:
 *  - `pe`       one evenly spaced slot per pay estimate, labeled PE1..PEn
 *  - `date`     one evenly spaced slot per pay estimate, labeled by the period's end date
 *  - `timeline` positioned by real date, so unequal/missing periods show as real gaps
 *               (periods with no recoverable date cannot be plotted at all -- see excludedPointCount)
 */
export type TimeAxisMode = "pe" | "date" | "timeline";

/** Cumulative metrics are drawn as a curve; per-period metrics as bars (except on the to-scale timeline). */
export const CUMULATIVE_METRICS: ChartMetric[] = ["cumulativeEarnedDollars", "cumulativeEarnedManHours"];
export const DOLLAR_METRICS: ChartMetric[] = ["earnedDollars", "cumulativeEarnedDollars"];

export const METRIC_LABELS: Record<ChartMetric, string> = {
  productionRatePerDay: "Production rate (units/day)",
  earnedManHoursPerDay: "Earned man-hours/day",
  productivityIndex: "Productivity index (proxy)",
  earnedDollars: "Earned dollars (period)",
  cumulativeEarnedDollars: "Cumulative earned dollars",
  cumulativeEarnedManHours: "Cumulative earned man-hours",
};

export interface ChartRow {
  peNumber: number;
  label: string;
  dateLabel: string | null;
  dateSource: ChartDateSource;
  periodRangeLabel: string | null;
  timestamp: number | null;
  value: number | null;
  /** Cumulative rows only: the running total omits >=1 period whose own contribution was unreported. */
  valueIsLowerBound: boolean;
  /** How many non-gap periods so far contributed an unknown (null) amount to this cumulative metric. */
  unknownContributionCount: number;
  periodClass: PeriodClass;
  isGap: boolean;
  citation: PointCitationDto | null;
}

export interface ChartRowsResult {
  /** Rows actually plotted (the to-scale timeline drops periods with no recoverable date). */
  rows: ChartRow[];
  /** Every period, plotted or not -- used to resolve the measured-mile window bounds. */
  allRows: ChartRow[];
  excludedPointCount: number;
}

export type ChartDateSource = "period_end" | "cutoff_date" | "period_start" | "none";

/**
 * Periods carry an end date, a cutoff date, or neither -- take the best available for positioning
 * and report which one was used, so an exported row can be reconciled against its chart position.
 * A period with none of the three is never given a synthesized date.
 */
export function pointTimestamp(p: Pick<MetricPointDto, "periodEnd" | "cutoffDate" | "periodStart">): {
  timestamp: number | null;
  dateLabel: string | null;
  dateSource: ChartDateSource;
  isoDate: string | null;
} {
  const candidates: Array<[ChartDateSource, string | null]> = [
    ["period_end", p.periodEnd],
    ["cutoff_date", p.cutoffDate],
    ["period_start", p.periodStart],
  ];
  for (const [dateSource, raw] of candidates) {
    if (!raw) continue;
    const parsed = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) continue;
    return { timestamp: parsed.getTime(), dateLabel: format(parsed, "d-MMM-yy"), dateSource, isoDate: raw };
  }
  return { timestamp: null, dateLabel: null, dateSource: "none", isoDate: null };
}

/**
 * Builds the chart's row set for one metric and axis mode.
 *
 * Cumulative totals run across the whole series in pay-estimate order and are NOT reset by a data
 * gap: a gap period contributes nothing to the running total, so the curve resumes at the same
 * height it left off rather than implying work was un-installed.
 *
 * A period whose own component figure is unreported (a NON-gap period with null earned man-hours
 * or null earned dollars) is never counted as zero -- that would fabricate a total. Its own point
 * plots nothing, and every later cumulative point is flagged as a lower bound so the curve is
 * read as "at least this much", not as a complete total.
 */
export function buildChartRows(
  points: MetricPointDto[],
  metric: ChartMetric,
  timeAxisMode: TimeAxisMode,
  citations?: PointCitationDto[]
): ChartRowsResult {
  const citationByPe = new Map((citations ?? []).map((c) => [c.peNumber, c]));

  let cumulativeManHours = 0;
  let cumulativeDollars = 0;
  let unknownManHourPeriods = 0;
  let unknownDollarPeriods = 0;

  const allRows: ChartRow[] = points.map((p) => {
    if (!p.isGap) {
      if (p.earnedManHours === null) unknownManHourPeriods += 1;
      else cumulativeManHours += p.earnedManHours;
      if (p.earnedDollars === null) unknownDollarPeriods += 1;
      else cumulativeDollars += p.earnedDollars;
    }
    const { timestamp, dateLabel, dateSource } = pointTimestamp(p);
    const metricValues: Record<ChartMetric, number | null> = {
      productionRatePerDay: p.productionRatePerDay,
      earnedManHoursPerDay: p.earnedManHoursPerDay,
      productivityIndex: p.productivityIndex,
      earnedDollars: p.earnedDollars,
      // The running total is only plottable at a period that reported its own contribution.
      cumulativeEarnedDollars: p.earnedDollars === null ? null : cumulativeDollars,
      cumulativeEarnedManHours: p.earnedManHours === null ? null : cumulativeManHours,
    };
    const unknownContributionCount =
      metric === "cumulativeEarnedManHours"
        ? unknownManHourPeriods
        : metric === "cumulativeEarnedDollars"
          ? unknownDollarPeriods
          : 0;
    return {
      peNumber: p.peNumber,
      label: timeAxisMode === "date" ? dateLabel ?? `PE${p.peNumber}` : `PE${p.peNumber}`,
      dateLabel,
      dateSource,
      periodRangeLabel: p.periodStart && p.periodEnd ? `${p.periodStart} → ${p.periodEnd}` : p.cutoffDate,
      timestamp,
      value: p.isGap ? null : metricValues[metric],
      valueIsLowerBound: CUMULATIVE_METRICS.includes(metric) && unknownContributionCount > 0,
      unknownContributionCount,
      periodClass: p.periodClass,
      isGap: p.isGap,
      citation: citationByPe.get(p.peNumber) ?? null,
    };
  });

  // A to-scale axis can only place a point that has a real date -- the rest are reported, not faked.
  const rows = timeAxisMode === "timeline" ? allRows.filter((r) => r.timestamp !== null) : allRows;
  return { rows, allRows, excludedPointCount: allRows.length - rows.length };
}

export function formatAxisValue(metric: ChartMetric, value: number): string {
  const compact = Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  return DOLLAR_METRICS.includes(metric) ? `$${compact}` : compact;
}

export function formatValue(metric: ChartMetric, value: number): string {
  if (DOLLAR_METRICS.includes(metric)) {
    return `$${Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`;
  }
  return value.toFixed(2);
}
