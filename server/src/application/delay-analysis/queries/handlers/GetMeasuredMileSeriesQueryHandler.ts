import type { GetMeasuredMileSeriesQuery } from '../GetMeasuredMileSeriesQuery';
import type { IMeasuredMileRepository } from '../../../../domain/delay-analysis/repositories/IMeasuredMileRepository';
import { MeasuredMileCalculator, type MeasuredMileResult, type MetricPoint } from '../../../../domain/measured-mile/MeasuredMileCalculator';

export interface MeasuredMileProvenance {
  itemNo: number;
  tablesRead: Array<{ table: string; rowCount: number; note?: string }>;
  formulas: Record<string, string>;
  measuredVsProxyTier: Record<string, string>;
  activeFilters: { verifiedOnly: boolean; wbsCodes: string[]; shiftHours: number };
  exclusions: { excludedUnits: string[]; excludedDescriptionKeywords: string[] };
  measuredMileWindowSource: 'auto_selected' | 'user_override' | 'not_found';
  dataQualitySummary: Record<string, number>;
  hasProxyData: boolean;
  crosswalkCostCodeCount: number;
}

/**
 * Per-point citation: the same formula named in `MeasuredMileProvenance.formulas`, but with the
 * *actual numbers for this specific pay-estimate period* substituted in, plus the named source
 * document(s) and row the number came from. This is what lets a reader verify one bar on the
 * chart without re-deriving it -- the symbolic formula alone is not sufficient evidence.
 */
export interface PointCitation {
  peNumber: number;
  installedQuantity: string | null;
  earnedManHours: string | null;
  productionRatePerDay: string | null;
  actualProxyHours: string | null;
  productivityIndex: string | null;
  dataQuality: string;
}

export interface GetMeasuredMileSeriesResult {
  series: MeasuredMileResult;
  provenance: MeasuredMileProvenance;
  pointCitations: PointCitation[];
}

function fmt(n: number | null, digits = 2): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function docList(names: string[]): string {
  return names.length > 0 ? names.join(', ') : 'no document identified';
}

/** Builds one citation per point: formula + this period's real numbers + named source documents. */
function buildPointCitations(points: MetricPoint[], itemNo: number, manHoursPerUnit: number | null): PointCitation[] {
  return points.map((p) => {
    if (p.isGap) {
      return {
        peNumber: p.peNumber,
        installedQuantity: null,
        earnedManHours: null,
        productionRatePerDay: null,
        actualProxyHours: null,
        productivityIndex: null,
        dataQuality: `Unrecoverable — ${p.dataQualitySourceFile}. ${p.gapReason ?? ''}`.trim(),
      };
    }

    const qtySourceLabel =
      p.quantityDeltaSource === 'direct'
        ? `PE${p.peNumber} "quantity this estimate" field, bid_item_progress_estimates row (item ${itemNo})`
        : p.quantityDeltaSource === 'derived_from_to_date'
        ? `derived: PE${p.peNumber} "quantity to date" minus prior period's cumulative, bid_item_progress_estimates (item ${itemNo})`
        : 'not reported for this period';
    const installedQuantity =
      p.installedQuantity !== null
        ? `${fmt(p.installedQuantity)} units — ${qtySourceLabel}, source document: ${p.dataQualitySourceFile}`
        : null;

    const earnedManHours =
      p.installedQuantity !== null && manHoursPerUnit !== null && p.earnedManHours !== null
        ? `${fmt(p.installedQuantity)} units × ${fmt(manHoursPerUnit, 3)} MH/unit = ${fmt(p.earnedManHours)} MH — bid_item_labor_estimates row (item ${itemNo})`
        : null;

    const productionRatePerDay =
      p.installedQuantity !== null && p.workingDays
        ? `${fmt(p.installedQuantity)} units ÷ ${p.workingDays} days = ${fmt(p.productionRatePerDay)} units/day — period ${p.periodStart ?? '?'} to ${p.periodEnd ?? '?'}`
        : null;

    const actualProxyHours =
      p.actualProxyHours !== null
        ? `${fmt(p.actualProxyHours)}h proxy — POD crew-days × assumed shift length, source document(s): ${docList(p.actualProxySourceDocuments)}`
        : null;

    const productivityIndex =
      p.earnedManHours !== null && p.actualProxyHours !== null && p.productivityIndex !== null
        ? `${fmt(p.earnedManHours)} MH ÷ ${fmt(p.actualProxyHours)}h (proxy) = ${fmt(p.productivityIndex, 2)}`
        : null;

    const dataQuality = `${p.dataQualityStatus}${p.dataQualityDeltaPct !== null ? ` (${fmt(p.dataQualityDeltaPct * 100, 1)}% delta vs. printed total)` : ''} — ${p.dataQualitySourceFile}${p.dataQualityNotes ? `; ${p.dataQualityNotes}` : ''}`;

    return {
      peNumber: p.peNumber,
      installedQuantity,
      earnedManHours,
      productionRatePerDay,
      actualProxyHours,
      productivityIndex,
      dataQuality,
    };
  });
}

const EXCLUDED_UNITS = ['LS', 'FA'];
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

export class GetMeasuredMileSeriesQueryHandler {
  constructor(private readonly repository: IMeasuredMileRepository) {}

  async execute(query: GetMeasuredMileSeriesQuery): Promise<GetMeasuredMileSeriesResult> {
    const options = { verifiedOnly: query.verifiedOnly, wbsCodes: query.wbsCodes };
    const bundle = await this.repository.getMeasuredMileInputBundle(
      query.projectId,
      query.tenantId,
      query.itemNo,
      options,
      query.shiftHours
    );

    const series = MeasuredMileCalculator.compute({
      itemNo: bundle.itemNo,
      manHoursPerUnit: bundle.manHoursPerUnit,
      periodQualities: bundle.periodQualities,
      progressRows: bundle.progressRows,
      impactByPeriod: bundle.impactByPeriod,
      laborProxyByPeriod: bundle.laborProxyByPeriod,
      manualAccelerationPeNumbers: bundle.manualAccelerationPeNumbers,
      measuredMileOverride: bundle.measuredMileOverride,
    });

    const totalImpactEvents = new Set<string>();
    for (const impact of Array.from(bundle.impactByPeriod.values())) {
      for (const id of impact.eventIds) totalImpactEvents.add(id);
    }

    const dataQualitySummary: Record<string, number> = {};
    for (const p of bundle.periodQualities) {
      dataQualitySummary[p.status] = (dataQualitySummary[p.status] ?? 0) + 1;
    }

    const proxyPeriodCount = Array.from(bundle.laborProxyByPeriod.values()).length;
    const proxyReportTotal = Array.from(bundle.laborProxyByPeriod.values()).reduce((sum, p) => sum + p.podReportCount, 0);

    const provenance: MeasuredMileProvenance = {
      itemNo: query.itemNo,
      tablesRead: [
        { table: 'bid_item_progress_estimates', rowCount: bundle.progressRows.length, note: 'per-period installed quantity and dollars for this item' },
        { table: 'pay_estimate_periods', rowCount: bundle.periodQualities.length, note: 'period date ranges and data-quality status, all periods' },
        {
          table: 'contractor_delay_events',
          rowCount: totalImpactEvents.size,
          note: query.verifiedOnly ? 'verified events only, date-overlap bucketed to periods' : 'all events regardless of verification, date-overlap bucketed to periods',
        },
        {
          table: 'pod_task_lines / pod_crew_members',
          rowCount: proxyReportTotal,
          note: bundle.crosswalkCostCodes.length > 0
            ? `POD reports touching this item's ${bundle.crosswalkCostCodes.length} crosswalked cost code(s): ${bundle.crosswalkCostCodes.join(', ')}`
            : 'no crosswalked cost codes found for this item -- proxy productivity index unavailable',
        },
      ],
      formulas: {
        installedQuantity: 'quantityThisEstimate (direct), or ΔquantityToDate vs. prior period when the direct field is null',
        earnedManHours: 'installedQuantity × manHoursPerUnit (budgeted per-unit rate, bid_item_labor_estimates)',
        productionRatePerDay: 'installedQuantity ÷ workingDays (periodEnd − periodStart + 1 calendar days)',
        actualProxyHours: 'POD crew-member-days for crosswalked cost codes in this period × shiftHours',
        productivityIndex: 'earnedManHours ÷ actualProxyHours (proxy; 1.0 = performing to the budgeted rate)',
        estimatedLostManHours: 'impacted-period quantity × (impacted actual-hours-per-unit − measured-mile actual-hours-per-unit); positive = extra hours consumed by inefficiency',
      },
      measuredVsProxyTier: {
        installedQuantity: 'measured (pay-estimate quantities)',
        productionRatePerDay: 'measured (pay-estimate quantities ÷ calendar days)',
        earnedManHours: 'measured x budgeted (installed quantity is measured; per-unit rate is the contractor\'s own bid estimate)',
        productivityIndex: 'proxy, Tier 3 (POD crew-headcount × assumed shift length; not timesheet hours)',
      },
      activeFilters: {
        verifiedOnly: query.verifiedOnly,
        wbsCodes: query.wbsCodes ?? [],
        shiftHours: query.shiftHours,
      },
      exclusions: {
        excludedUnits: EXCLUDED_UNITS,
        excludedDescriptionKeywords: EXCLUDED_DESCRIPTION_KEYWORDS,
      },
      measuredMileWindowSource: series.measuredMileWindow
        ? bundle.measuredMileOverride
          ? 'user_override'
          : 'auto_selected'
        : 'not_found',
      dataQualitySummary,
      hasProxyData: proxyPeriodCount > 0,
      crosswalkCostCodeCount: bundle.crosswalkCostCodes.length,
    };

    const pointCitations = buildPointCitations(series.points, query.itemNo, bundle.manHoursPerUnit);

    return { series, provenance, pointCitations };
  }
}
