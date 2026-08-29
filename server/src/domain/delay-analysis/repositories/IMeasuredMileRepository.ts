import type {
  PeriodQuality,
  RawProgressRow,
  PeriodImpact,
  PeriodLaborProxy,
  MeasuredMileWindowRange,
} from '../../measured-mile/MeasuredMileCalculator';
import type { JobWidePeriodInput } from '../../measured-mile/JobWideProductivityCalculator';

export interface EligibleBidItem {
  itemNo: number;
  description: string | null;
  units: string | null;
  unitPrice: number | null;
  contractQuantity: number | null;
  contractDollars: number | null;
  manHoursPerUnit: number | null;
  budgetedManHours: number | null;
  periodsWithProduction: number;
}

export interface DelayEventFilterOptions {
  verifiedOnly: boolean;
  /** Restrict impact overlap to events matched to these WBS codes; empty/undefined = no filter. */
  wbsCodes?: string[];
}

export interface MeasuredMileInputBundle {
  itemNo: number;
  manHoursPerUnit: number | null;
  periodQualities: PeriodQuality[];
  progressRows: RawProgressRow[];
  impactByPeriod: Map<number, PeriodImpact>;
  laborProxyByPeriod: Map<number, PeriodLaborProxy>;
  manualAccelerationPeNumbers: Set<number>;
  measuredMileOverride: MeasuredMileWindowRange | null;
  /** Normalized cost codes crosswalked to this item, for provenance -- empty when no proxy data exists. */
  crosswalkCostCodes: string[];
}

export interface DelayEventSummaryForPeriod {
  id: string;
  eventDescription: string;
  eventCategory: string | null;
  eventStartDate: string | null;
  eventFinishDate: string | null;
  impactDurationHours: number | null;
  verificationStatus: string;
  wbs: string | null;
  cpmActivityId: string | null;
}

export interface ScheduleActivitySummaryForPeriod {
  activityId: string;
  wbs: string | null;
  activityDescription: string;
  isCriticalPath: string;
  actualStartDate: string | null;
  actualFinishDate: string | null;
}

export interface DiaryContextForPeriod {
  reportDate: string;
  documentName: string | null;
  entryCount: number;
}

export interface PodContextForPeriod {
  reportDate: string;
  documentName: string | null;
  crewSectionCount: number;
}

/**
 * Reads for the Measured Mile page. Every method is tenant-scoped and read-only; this feature
 * never writes to any of the underlying analysis tables (it only writes to the two small
 * measured_mile_* adjustment tables, via the command handlers).
 */
export interface IMeasuredMileRepository {
  getEligibleBidItems(projectId: string, tenantId: string): Promise<EligibleBidItem[]>;

  getManHoursPerUnit(projectId: string, tenantId: string, itemNo: number): Promise<number | null>;

  getPeriodQualities(projectId: string, tenantId: string): Promise<PeriodQuality[]>;

  getProgressRows(projectId: string, tenantId: string, itemNo: number): Promise<RawProgressRow[]>;

  /** Buckets delay events into pay-estimate periods by date overlap, summing impactDurationHours. */
  getImpactByPeriod(
    projectId: string,
    tenantId: string,
    periods: PeriodQuality[],
    options: DelayEventFilterOptions
  ): Promise<Map<number, PeriodImpact>>;

  /**
   * Tier-3 proxy: POD crew-member-days x shiftHours for this item's crosswalked cost codes
   * (via bid_item_cost_estimate_lines.subActivityCode <-> pod_task_lines.costCode), bucketed by
   * period date range. Returns an empty map when the item has no crosswalked cost codes.
   */
  getLaborProxyByPeriod(
    projectId: string,
    tenantId: string,
    itemNo: number,
    periods: PeriodQuality[],
    shiftHours: number
  ): Promise<Map<number, PeriodLaborProxy>>;

  getManualAccelerationPeNumbers(projectId: string, tenantId: string, itemNo: number): Promise<Set<number>>;

  getMeasuredMileOverride(
    projectId: string,
    tenantId: string,
    itemNo: number
  ): Promise<MeasuredMileWindowRange | null>;

  setAccelerationTag(projectId: string, tenantId: string, itemNo: number, peNumber: number, createdBy?: string): Promise<void>;
  clearAccelerationTag(projectId: string, tenantId: string, itemNo: number, peNumber: number): Promise<void>;

  setMeasuredMileOverride(
    projectId: string,
    tenantId: string,
    itemNo: number,
    range: MeasuredMileWindowRange,
    createdBy?: string
  ): Promise<void>;
  clearMeasuredMileOverride(projectId: string, tenantId: string, itemNo: number): Promise<void>;

  /** All the reads needed to run the calculator for one item, bundled in one call. */
  getMeasuredMileInputBundle(
    projectId: string,
    tenantId: string,
    itemNo: number,
    options: DelayEventFilterOptions,
    shiftHours: number
  ): Promise<MeasuredMileInputBundle>;

  /**
   * Job-wide Tier 1/2 measured productivity factor inputs, one row per pay-estimate period.
   * `eligibleItemNos` restricts the earned-man-hours sum to direct-work bid items only (the same
   * set getEligibleBidItems returns) -- indirect/overhead items are never part of "earned" work.
   */
  getJobWideProductivityInputs(
    projectId: string,
    tenantId: string,
    eligibleItemNos: Set<number>
  ): Promise<JobWidePeriodInput[]>;

  getDelayEventsForPeriod(
    projectId: string,
    tenantId: string,
    periodStart: string | null,
    periodEnd: string | null,
    options: DelayEventFilterOptions
  ): Promise<DelayEventSummaryForPeriod[]>;

  getScheduleActivitiesForPeriod(
    projectId: string,
    tenantId: string,
    periodStart: string | null,
    periodEnd: string | null
  ): Promise<ScheduleActivitySummaryForPeriod[]>;

  getDiaryContextForPeriod(
    projectId: string,
    tenantId: string,
    periodStart: string | null,
    periodEnd: string | null
  ): Promise<DiaryContextForPeriod[]>;

  getPodContextForPeriod(
    projectId: string,
    tenantId: string,
    periodStart: string | null,
    periodEnd: string | null
  ): Promise<PodContextForPeriod[]>;
}
