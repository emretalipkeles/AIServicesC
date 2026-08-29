import type { GetMeasuredMileLocationSeriesQuery } from '../GetMeasuredMileLocationSeriesQuery';
import type { IMeasuredMileRepository } from '../../../../domain/delay-analysis/repositories/IMeasuredMileRepository';
import { MeasuredMileCalculator } from '../../../../domain/measured-mile/MeasuredMileCalculator';
import { CorridorLocationAllocationCalculator, type LocationSeriesResult } from '../../../../domain/measured-mile/CorridorLocationAllocationCalculator';

export interface LocationSeriesProvenance {
  itemNo: number;
  tablesRead: Array<{ table: string; rowCount: number; note?: string }>;
  allocationRule: string;
  classificationRule: string;
  confidenceTierMeaning: Record<string, string>;
  activeFilters: { verifiedOnly: boolean; wbsCodes: string[]; shiftHours: number };
  corridorLocationCount: number;
  hasCrosswalkCostCodes: boolean;
}

export interface GetMeasuredMileLocationSeriesResult {
  locationSeries: LocationSeriesResult;
  provenance: LocationSeriesProvenance;
}

export class GetMeasuredMileLocationSeriesQueryHandler {
  constructor(private readonly repository: IMeasuredMileRepository) {}

  async execute(query: GetMeasuredMileLocationSeriesQuery): Promise<GetMeasuredMileLocationSeriesResult> {
    const options = { verifiedOnly: query.verifiedOnly, wbsCodes: query.wbsCodes };

    const [bundle, locations, overrideLookup] = await Promise.all([
      this.repository.getMeasuredMileInputBundle(query.projectId, query.tenantId, query.itemNo, options, query.shiftHours),
      this.repository.getCorridorLocations(query.projectId, query.tenantId),
      this.repository.getLocationOverrideLookup(query.projectId, query.tenantId),
    ]);

    // getLocationAllocationInputs needs the resolved period list, which only exists once the
    // bundle's own getPeriodQualities read has completed.
    const inputsWithPeriods = await this.repository.getLocationAllocationInputs(
      query.projectId,
      query.tenantId,
      query.itemNo,
      bundle.periodQualities,
      options
    );

    const timeSeries = MeasuredMileCalculator.compute({
      itemNo: bundle.itemNo,
      manHoursPerUnit: bundle.manHoursPerUnit,
      periodQualities: bundle.periodQualities,
      progressRows: bundle.progressRows,
      impactByPeriod: bundle.impactByPeriod,
      laborProxyByPeriod: bundle.laborProxyByPeriod,
      manualAccelerationPeNumbers: bundle.manualAccelerationPeNumbers,
      measuredMileOverride: bundle.measuredMileOverride,
    });

    const locationSeries = CorridorLocationAllocationCalculator.compute({
      itemNo: query.itemNo,
      itemDescription: inputsWithPeriods.itemDescription,
      manHoursPerUnit: bundle.manHoursPerUnit,
      points: timeSeries.points,
      evidence: inputsWithPeriods.evidence,
      delayEvents: inputsWithPeriods.delayEvents,
      locations,
      overrides: overrideLookup,
    });

    const provenance: LocationSeriesProvenance = {
      itemNo: query.itemNo,
      tablesRead: [
        { table: 'schedule_activities', rowCount: inputsWithPeriods.evidence.filter((e) => e.sourceType === 'schedule_activity').length, note: 'wbs/activityDescription free text, fallback location source' },
        { table: 'pod_task_lines / pod_crew_members', rowCount: inputsWithPeriods.evidence.filter((e) => e.sourceType === 'pod_task_line').length, note: 'crosswalked via bid_item_cost_estimate_lines.subActivityCode, primary location source' },
        { table: 'contractor_delay_events', rowCount: inputsWithPeriods.delayEvents.length, note: 'events carrying their own wbs, overlaid onto matching locations' },
        { table: 'corridor_locations', rowCount: locations.length, note: 'editable west->east ordering, auto-seeded on first read' },
      ],
      allocationRule:
        'Each period\'s installed quantity is split across the corridor location(s) its location evidence resolves to. POD crew-day evidence (crosswalked cost codes) is used whenever it resolves to at least one location; schedule-activity evidence is only used as a fallback for periods where POD evidence is absent or unresolved. A range match ("11TH TO 12TH") splits its weight evenly across every station in the span. A period with no resolvable location evidence allocates nothing -- see unallocatedPeriods.',
      classificationRule:
        'A location-period pair is forced to \'impact\' when a delay event\'s own wbs resolves to that location AND its dates overlap that period, even if the period\'s job-wide classification was different (e.g. an impact affecting only one part of the corridor). Otherwise it inherits the time-axis period classification. The dominant class per location is the weight-share-weighted vote, tie-broken impact > acceleration > measured_mile > neutral > gap.',
      confidenceTierMeaning: {
        measured: 'Backed by POD crew-day evidence with a high-confidence (single or tight-range) location match, across enough periods to be meaningful.',
        estimated: 'Backed by schedule-activity fallback evidence, or a lower-confidence/wider-range match.',
        thin: 'Very little corroborating evidence (a small fractional weight share) -- treat this figure as indicative only.',
        no_data: 'No period ever produced allocable evidence for this location.',
      },
      activeFilters: { verifiedOnly: query.verifiedOnly, wbsCodes: query.wbsCodes ?? [], shiftHours: query.shiftHours },
      corridorLocationCount: locations.length,
      hasCrosswalkCostCodes: inputsWithPeriods.evidence.some((e) => e.sourceType === 'pod_task_line'),
    };

    return { locationSeries, provenance };
  }
}
