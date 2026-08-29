import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface EligibleBidItemDto {
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

export type QuantityDeltaSource = 'direct' | 'derived_from_to_date' | 'not_reported' | 'unavailable';
export type PeriodClass = 'impact' | 'measured_mile' | 'acceleration' | 'neutral' | 'gap';
export type PeriodQualityStatus =
  | 'exact'
  | 'minor_discrepancy'
  | 'significant_discrepancy'
  | 'unvalidated'
  | 'unrecoverable';

export interface MetricPointDto {
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
  actualProxySourceDocuments: string[];
  productivityIndex: number | null;
  dataQualityStatus: PeriodQualityStatus;
  dataQualityDeltaPct: number | null;
  dataQualityNotes: string | null;
  dataQualitySourceFile: string;
  periodClass: PeriodClass;
  impactHours: number;
  impactEventIds: string[];
  isManualAcceleration: boolean;
}

export interface MeasuredMileWindowDto {
  startPeNumber: number;
  endPeNumber: number;
  periodCount: number;
  avgProductionRatePerDay: number | null;
  avgEarnedManHoursPerDay: number | null;
  isAutoSelected: boolean;
}

export interface LossStatisticsDto {
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

export interface MeasuredMileResultDto {
  itemNo: number;
  manHoursPerUnit: number | null;
  points: MetricPointDto[];
  measuredMileWindow: MeasuredMileWindowDto | null;
  lossStatistics: LossStatisticsDto;
}

export interface MeasuredMileProvenanceDto {
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

export interface PointCitationDto {
  peNumber: number;
  installedQuantity: string | null;
  earnedManHours: string | null;
  productionRatePerDay: string | null;
  actualProxyHours: string | null;
  productivityIndex: string | null;
  dataQuality: string;
}

export interface MeasuredMileSeriesResponse {
  series: MeasuredMileResultDto;
  provenance: MeasuredMileProvenanceDto;
  pointCitations: PointCitationDto[];
}

export interface JobWideProductivityPointDto {
  peNumber: number;
  cutoffDate: string | null;
  totalEarnedManHours: number | null;
  totalDirectPayrollHours: number | null;
  forceAccountHours: number | null;
  baseContractHours: number | null;
  productivityFactor: number | null;
  disruptionIntensityPct: number | null;
}

export interface JobWideProductivityProvenanceDto {
  tablesRead: Array<{ table: string; rowCount: number; note: string }>;
  formulas: Record<string, string>;
  measuredVsProxyTier: string;
  limitation: string;
}

export interface JobWideProductivityResponse {
  points: JobWideProductivityPointDto[];
  provenance: JobWideProductivityProvenanceDto;
}

export interface PeriodDetailDelayEventDto {
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

export interface PeriodDetailScheduleActivityDto {
  activityId: string;
  wbs: string | null;
  activityDescription: string;
  isCriticalPath: string;
  actualStartDate: string | null;
  actualFinishDate: string | null;
}

export interface PeriodDetailDiaryDto {
  reportDate: string;
  documentName: string | null;
  entryCount: number;
}

export interface PeriodDetailPodDto {
  reportDate: string;
  documentName: string | null;
  crewSectionCount: number;
}

export interface MeasuredMilePeriodDetailResponse {
  peNumber: number;
  periodStart: string | null;
  periodEnd: string | null;
  delayEvents: PeriodDetailDelayEventDto[];
  scheduleActivities: PeriodDetailScheduleActivityDto[];
  diaryContext: PeriodDetailDiaryDto[];
  podContext: PeriodDetailPodDto[];
  citations: Array<{ documentName: string; note: string }>;
}

// -- Street/distance (corridor location) view --------------------------------------------------

export interface CorridorLocationDto {
  key: string;
  label: string;
  defaultStationOrder: number;
  approxDistanceFt: number;
}

export interface CorridorLocationOverrideDto {
  rawText: string;
  locationKey: string;
  createdBy: string | null;
  createdAt: string | null;
}

export interface CorridorLocationsResponse {
  locations: CorridorLocationDto[];
  overrides: CorridorLocationOverrideDto[];
}

export type LocationMatchConfidence = 'high' | 'medium' | 'low' | 'forced_override';

export interface LocationEvidenceItemDto {
  rawText: string;
  sourceType: 'pod_task_line' | 'schedule_activity';
  documentName: string | null;
  matchConfidence: LocationMatchConfidence;
  matchType: 'single' | 'range' | 'override';
}

export interface LocationPeriodContributionDto {
  peNumber: number;
  allocatedQuantity: number;
  weightShare: number;
  allocatedWorkingDays: number | null;
  sourceTypeUsed: 'pod_task_line' | 'schedule_activity';
  periodClass: PeriodClass;
  forcedImpactByLocationEvent: boolean;
  evidence: LocationEvidenceItemDto[];
}

export interface OverlaidDelayEventDto {
  eventId: string;
  wbs: string;
  eventDescription: string;
  eventStartDate: string | null;
  eventFinishDate: string | null;
  impactDurationHours: number | null;
  overlapsProductionPeriod: boolean;
}

export type LocationConfidenceTier = 'measured' | 'estimated' | 'thin' | 'no_data';

export interface LocationSeriesPointDto {
  key: string;
  label: string;
  stationOrder: number;
  approxDistanceFt: number;
  totalAllocatedQuantity: number | null;
  totalAllocatedEarnedManHours: number | null;
  totalAllocatedWorkingDays: number | null;
  productionRatePerDay: number | null;
  dominantPeriodClass: PeriodClass | 'no_data';
  confidenceTier: LocationConfidenceTier;
  contributingPeriods: LocationPeriodContributionDto[];
  overlaidDelayEvents: OverlaidDelayEventDto[];
}

export interface UnallocatedPeriodDto {
  peNumber: number;
  installedQuantity: number;
  reason: string;
}

export interface LocationSeriesResultDto {
  itemNo: number;
  locations: LocationSeriesPointDto[];
  unallocatedPeriods: UnallocatedPeriodDto[];
  unmatchedEvidenceSamples: string[];
}

export interface LocationSeriesProvenanceDto {
  itemNo: number;
  tablesRead: Array<{ table: string; rowCount: number; note?: string }>;
  allocationRule: string;
  classificationRule: string;
  confidenceTierMeaning: Record<string, string>;
  activeFilters: { verifiedOnly: boolean; wbsCodes: string[]; shiftHours: number };
  corridorLocationCount: number;
  hasCrosswalkCostCodes: boolean;
}

export interface MeasuredMileLocationSeriesResponse {
  locationSeries: LocationSeriesResultDto;
  provenance: LocationSeriesProvenanceDto;
}

async function unwrap<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: fallback }));
    throw new Error(error.error || fallback);
  }
  const result = await response.json();
  return result.data as T;
}

const base = (projectId: string) => `/api/delay-analysis/projects/${projectId}/measured-mile`;

export function useEligibleMeasuredMileItems(projectId: string) {
  return useQuery({
    queryKey: ["measured-mile-items", projectId],
    queryFn: async () => unwrap<EligibleBidItemDto[]>(await fetch(`${base(projectId)}/items`), "Failed to load bid items"),
    enabled: !!projectId,
  });
}

export interface MeasuredMileSeriesFilters {
  verifiedOnly: boolean;
  wbsCodes?: string[];
  shiftHours: number;
}

export function useMeasuredMileSeries(projectId: string, itemNo: number | null, filters: MeasuredMileSeriesFilters) {
  return useQuery({
    queryKey: ["measured-mile-series", projectId, itemNo, filters.verifiedOnly, filters.wbsCodes, filters.shiftHours],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('verifiedOnly', String(filters.verifiedOnly));
      params.set('shiftHours', String(filters.shiftHours));
      if (filters.wbsCodes && filters.wbsCodes.length > 0) params.set('wbsCodes', filters.wbsCodes.join(','));
      return unwrap<MeasuredMileSeriesResponse>(
        await fetch(`${base(projectId)}/items/${itemNo}/series?${params.toString()}`),
        "Failed to compute measured mile series"
      );
    },
    enabled: !!projectId && itemNo !== null,
  });
}

export function useJobWideProductivity(projectId: string) {
  return useQuery({
    queryKey: ["measured-mile-job-wide", projectId],
    queryFn: async () =>
      unwrap<JobWideProductivityResponse>(await fetch(`${base(projectId)}/job-wide-productivity`), "Failed to load job-wide productivity"),
    enabled: !!projectId,
  });
}

export function useMeasuredMilePeriodDetail(
  projectId: string,
  peNumber: number | null,
  filters: { verifiedOnly: boolean; wbsCodes?: string[] }
) {
  return useQuery({
    queryKey: ["measured-mile-period-detail", projectId, peNumber, filters.verifiedOnly, filters.wbsCodes],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('verifiedOnly', String(filters.verifiedOnly));
      if (filters.wbsCodes && filters.wbsCodes.length > 0) params.set('wbsCodes', filters.wbsCodes.join(','));
      return unwrap<MeasuredMilePeriodDetailResponse>(
        await fetch(`${base(projectId)}/periods/${peNumber}/detail?${params.toString()}`),
        "Failed to load period detail"
      );
    },
    enabled: !!projectId && peNumber !== null,
  });
}

export function useSetAccelerationTag(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemNo, peNumber }: { itemNo: number; peNumber: number }) => {
      const response = await fetch(`${base(projectId)}/items/${itemNo}/acceleration/${peNumber}`, { method: "POST" });
      return unwrap<void>(response, "Failed to set acceleration tag");
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["measured-mile-series", projectId, variables.itemNo] });
      // The location series derives its period classification (measured mile / impact / etc.)
      // from the same acceleration-tag and window-override state, so it must be invalidated
      // alongside the time series or the street/distance view can show stale colors/classes.
      queryClient.invalidateQueries({ queryKey: ["measured-mile-location-series", projectId, variables.itemNo] });
    },
  });
}

export function useClearAccelerationTag(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemNo, peNumber }: { itemNo: number; peNumber: number }) => {
      const response = await fetch(`${base(projectId)}/items/${itemNo}/acceleration/${peNumber}`, { method: "DELETE" });
      return unwrap<void>(response, "Failed to clear acceleration tag");
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["measured-mile-series", projectId, variables.itemNo] });
      queryClient.invalidateQueries({ queryKey: ["measured-mile-location-series", projectId, variables.itemNo] });
    },
  });
}

export function useSetMeasuredMileOverride(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemNo,
      startPeNumber,
      endPeNumber,
    }: {
      itemNo: number;
      startPeNumber: number;
      endPeNumber: number;
    }) => {
      const response = await fetch(`${base(projectId)}/items/${itemNo}/window-override`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startPeNumber, endPeNumber }),
      });
      return unwrap<void>(response, "Failed to set measured mile window");
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["measured-mile-series", projectId, variables.itemNo] });
      queryClient.invalidateQueries({ queryKey: ["measured-mile-location-series", projectId, variables.itemNo] });
    },
  });
}

export function useClearMeasuredMileOverride(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemNo }: { itemNo: number }) => {
      const response = await fetch(`${base(projectId)}/items/${itemNo}/window-override`, { method: "DELETE" });
      return unwrap<void>(response, "Failed to clear measured mile window");
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["measured-mile-series", projectId, variables.itemNo] });
      queryClient.invalidateQueries({ queryKey: ["measured-mile-location-series", projectId, variables.itemNo] });
    },
  });
}

export function useMeasuredMileLocationSeries(projectId: string, itemNo: number | null, filters: MeasuredMileSeriesFilters) {
  return useQuery({
    queryKey: ["measured-mile-location-series", projectId, itemNo, filters.verifiedOnly, filters.wbsCodes, filters.shiftHours],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('verifiedOnly', String(filters.verifiedOnly));
      params.set('shiftHours', String(filters.shiftHours));
      if (filters.wbsCodes && filters.wbsCodes.length > 0) params.set('wbsCodes', filters.wbsCodes.join(','));
      return unwrap<MeasuredMileLocationSeriesResponse>(
        await fetch(`${base(projectId)}/items/${itemNo}/location-series?${params.toString()}`),
        "Failed to compute measured mile location series"
      );
    },
    enabled: !!projectId && itemNo !== null,
  });
}

export function useCorridorLocations(projectId: string) {
  return useQuery({
    queryKey: ["measured-mile-corridor-locations", projectId],
    queryFn: async () =>
      unwrap<CorridorLocationsResponse>(await fetch(`${base(projectId)}/corridor-locations`), "Failed to load corridor locations"),
    enabled: !!projectId,
  });
}

export function useUpdateCorridorLocation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      locationKey,
      label,
      stationOrder,
    }: {
      locationKey: string;
      label?: string;
      stationOrder?: number;
    }) => {
      const response = await fetch(`${base(projectId)}/corridor-locations/${encodeURIComponent(locationKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, stationOrder }),
      });
      return unwrap<CorridorLocationDto>(response, "Failed to update corridor location");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["measured-mile-corridor-locations", projectId] });
      queryClient.invalidateQueries({ queryKey: ["measured-mile-location-series", projectId] });
    },
  });
}

export function useSetLocationOverride(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rawText, locationKey }: { rawText: string; locationKey: string }) => {
      const response = await fetch(`${base(projectId)}/location-overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, locationKey }),
      });
      return unwrap<void>(response, "Failed to set location override");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["measured-mile-corridor-locations", projectId] });
      queryClient.invalidateQueries({ queryKey: ["measured-mile-location-series", projectId] });
    },
  });
}

export function useClearLocationOverride(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rawText }: { rawText: string }) => {
      const response = await fetch(`${base(projectId)}/location-overrides`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });
      return unwrap<void>(response, "Failed to clear location override");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["measured-mile-corridor-locations", projectId] });
      queryClient.invalidateQueries({ queryKey: ["measured-mile-location-series", projectId] });
    },
  });
}
