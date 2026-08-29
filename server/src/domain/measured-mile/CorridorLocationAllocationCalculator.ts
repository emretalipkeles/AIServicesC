// Measured Mile street/distance view -- pure domain calculator, NO database access (mirrors the
// MeasuredMileCalculator convention: see __tests__/CorridorLocationAllocationCalculator.test.ts).
//
// Pay-estimate quantities have no location dimension. This calculator takes the SAME per-period
// MetricPoint[] the time-axis view already computed and re-distributes each period's installed
// quantity across corridor locations using location evidence gathered from schedule_activities.wbs
// and pod_task_lines (crosswalked via cost code), per the allocation rules in the task spec:
//   - POD crew-day evidence is used when present for a period; schedule-activity coverage is only
//     a fallback for periods where POD evidence is entirely absent.
//   - A range match (e.g. "11TH TO 12TH") splits its weight evenly across every station it spans.
//   - A period with zero resolvable location weight allocates nothing -- it is recorded as
//     unallocated, never smeared evenly across the corridor to "fill the chart".
//   - A location-specific delay event (WBS matches this location AND dates overlap the period)
//     forces that location-period pair to 'impact' even when the job-wide period classification
//     was something else (e.g. the impact hit only one block of the corridor that period).

import type { MetricPoint, PeriodClass } from './MeasuredMileCalculator';
import {
  matchLocationText,
  activityMatchesItemDescription,
  type CanonicalCorridorLocation,
  type LocationMatchConfidence,
} from './CorridorLocationModel';

export type LocationEvidenceSourceType = 'pod_task_line' | 'schedule_activity';

/** One raw location clue for a single pay-estimate period, before normalization. */
export interface LocationEvidenceCandidate {
  peNumber: number;
  sourceType: LocationEvidenceSourceType;
  /** Primary text tried for location matching (e.g. a schedule activity's WBS, or a POD task-line description). */
  rawText: string;
  /**
   * Second text tried for location matching ONLY when `rawText` doesn't resolve to a corridor
   * location -- e.g. a schedule activity's free-text description, tried when its WBS is generic
   * ("MOBILIZATION") rather than a location string. Never combined/unioned with rawText's match;
   * whichever text resolves first wins, so an activity is never silently dropped just because its
   * WBS happens not to be a location string.
   */
  secondaryLocationText?: string | null;
  /**
   * Text used for item-relevance filtering (activityMatchesItemDescription), independent of which
   * text resolved the location. A schedule activity's WBS is typically pure location text with no
   * work-type keywords, so relevance must be checked against its free-text description, not
   * whichever of rawText/secondaryLocationText happened to win the location match. Defaults to
   * `rawText` when absent (e.g. POD task lines, which are already crosswalked by cost code and
   * don't need this filter).
   */
  itemRelevanceText?: string | null;
  /** Crew-days for POD lines; a flat per-matched-activity weight (1) for schedule-activity fallback. */
  weight: number;
  documentName: string | null;
}

/** A delay event carrying its own WBS, overlaid onto whichever location(s) that WBS resolves to. */
export interface DelayEventLocationCandidate {
  eventId: string;
  wbs: string;
  /** Tried as a location-matching fallback when `wbs` itself doesn't resolve to a corridor location. */
  eventDescription: string;
  eventStartDate: string | null;
  eventFinishDate: string | null;
  impactDurationHours: number | null;
}

/** Exact raw-text override, consulted before the regex matcher. Keyed by lowercased raw text. */
export interface LocationOverrideMap {
  get(rawTextLower: string): string[] | undefined; // forced canonical location key(s)
}

export interface LocationEvidenceItem {
  rawText: string;
  sourceType: LocationEvidenceSourceType;
  documentName: string | null;
  matchConfidence: LocationMatchConfidence | 'forced_override';
  matchType: 'single' | 'range' | 'override';
}

export interface LocationPeriodContribution {
  peNumber: number;
  allocatedQuantity: number;
  weightShare: number;
  allocatedWorkingDays: number | null;
  sourceTypeUsed: LocationEvidenceSourceType;
  periodClass: PeriodClass;
  forcedImpactByLocationEvent: boolean;
  evidence: LocationEvidenceItem[];
}

export type LocationConfidenceTier = 'measured' | 'estimated' | 'thin' | 'no_data';

export interface OverlaidDelayEvent {
  eventId: string;
  wbs: string;
  eventDescription: string;
  eventStartDate: string | null;
  eventFinishDate: string | null;
  impactDurationHours: number | null;
  /** Whether this event's dates actually overlapped a period that contributed to this location. */
  overlapsProductionPeriod: boolean;
}

export interface LocationSeriesPoint {
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
  contributingPeriods: LocationPeriodContribution[];
  overlaidDelayEvents: OverlaidDelayEvent[];
}

export interface UnallocatedPeriod {
  peNumber: number;
  installedQuantity: number;
  reason: string;
}

export interface LocationSeriesResult {
  itemNo: number;
  locations: LocationSeriesPoint[];
  unallocatedPeriods: UnallocatedPeriod[];
  /** Deduped raw text samples that carried no recognizable corridor token, for corrective review. */
  unmatchedEvidenceSamples: string[];
}

export interface CorridorLocationAllocationInput {
  itemNo: number;
  itemDescription: string | null;
  manHoursPerUnit: number | null;
  points: MetricPoint[];
  evidence: LocationEvidenceCandidate[];
  delayEvents: DelayEventLocationCandidate[];
  locations: CanonicalCorridorLocation[];
  overrides: LocationOverrideMap;
}

const CLASS_PRIORITY: PeriodClass[] = ['impact', 'acceleration', 'measured_mile', 'neutral', 'gap'];

interface ResolvedLocation {
  keys: string[];
  confidence: LocationMatchConfidence | 'forced_override';
  matchType: 'single' | 'range' | 'override';
  /** Which text actually produced this match -- used to report accurate evidence back to the caller. */
  matchedText: string;
}

function resolveLocationKeysFromText(
  rawText: string,
  locations: CanonicalCorridorLocation[],
  overrides: LocationOverrideMap
): Omit<ResolvedLocation, 'matchedText'> | null {
  const forced = overrides.get(rawText.trim().toLowerCase());
  if (forced && forced.length > 0) {
    return { keys: forced, confidence: 'forced_override', matchType: 'override' };
  }
  const match = matchLocationText(rawText, locations);
  if (!match) return null;
  return { keys: match.matchedKeys, confidence: match.confidence, matchType: match.matchType };
}

/**
 * Tries `rawText` first; only falls back to `secondaryText` when `rawText` itself doesn't resolve
 * to a corridor location. The two texts are never merged/unioned -- whichever resolves first wins.
 * This keeps a schedule activity from being wrongly discarded (or matched against generic,
 * non-location WBS text) when its real location signal lives in its free-text description instead.
 */
function resolveLocationKeys(
  rawText: string,
  secondaryText: string | null | undefined,
  locations: CanonicalCorridorLocation[],
  overrides: LocationOverrideMap
): ResolvedLocation | null {
  const primary = resolveLocationKeysFromText(rawText, locations, overrides);
  if (primary) return { ...primary, matchedText: rawText };
  if (secondaryText && secondaryText.trim() && secondaryText !== rawText) {
    const secondary = resolveLocationKeysFromText(secondaryText, locations, overrides);
    if (secondary) return { ...secondary, matchedText: secondaryText };
  }
  return null;
}

export class CorridorLocationAllocationCalculator {
  static compute(input: CorridorLocationAllocationInput): LocationSeriesResult {
    const locationsByKey = new Map(input.locations.map((l) => [l.key, l]));
    const locationOrder = [...input.locations].sort((a, b) => a.defaultStationOrder - b.defaultStationOrder);

    // location key -> peNumber -> contribution
    const contributionsByLocation = new Map<string, Map<number, LocationPeriodContribution>>();
    for (const loc of locationOrder) contributionsByLocation.set(loc.key, new Map());

    const unallocatedPeriods: UnallocatedPeriod[] = [];
    const unmatchedSamples = new Set<string>();

    const evidenceByPeriod = new Map<number, LocationEvidenceCandidate[]>();
    for (const e of input.evidence) {
      const list = evidenceByPeriod.get(e.peNumber) ?? [];
      list.push(e);
      evidenceByPeriod.set(e.peNumber, list);
    }

    for (const point of input.points) {
      if (point.isGap || point.installedQuantity === null || point.installedQuantity <= 0) continue;

      const periodEvidence = evidenceByPeriod.get(point.peNumber) ?? [];
      const podEvidence = periodEvidence.filter((e) => e.sourceType === 'pod_task_line');
      const activityEvidence = periodEvidence.filter((e) => e.sourceType === 'schedule_activity');

      // Resolve each candidate to location keys once, up front, so we know whether POD evidence
      // actually resolved to anything before deciding whether to fall back to schedule activities.
      type Resolved = {
        candidate: LocationEvidenceCandidate;
        keys: string[];
        confidence: LocationMatchConfidence | 'forced_override';
        matchType: 'single' | 'range' | 'override';
        matchedText: string;
      };
      const resolve = (candidates: LocationEvidenceCandidate[]): Resolved[] => {
        const out: Resolved[] = [];
        for (const c of candidates) {
          const resolved = resolveLocationKeys(c.rawText, c.secondaryLocationText, input.locations, input.overrides);
          if (!resolved) {
            unmatchedSamples.add(c.rawText.trim());
            continue;
          }
          out.push({
            candidate: c,
            keys: resolved.keys,
            confidence: resolved.confidence,
            matchType: resolved.matchType,
            matchedText: resolved.matchedText,
          });
        }
        return out;
      };

      const resolvedPod = resolve(podEvidence);
      const podWeightTotal = resolvedPod.reduce((sum, r) => sum + r.candidate.weight, 0);

      let chosen: Resolved[];
      let sourceTypeUsed: LocationEvidenceSourceType;
      if (podWeightTotal > 0) {
        chosen = resolvedPod;
        sourceTypeUsed = 'pod_task_line';
      } else {
        // Relevance is judged on the activity's free-text description, never its WBS: a WBS is
        // typically pure location text ("11TH TO 12TH") with no work-type keywords, so filtering
        // on it here would silently disable this relevance filter for almost every activity.
        const relevantActivityEvidence = activityEvidence.filter((e) =>
          activityMatchesItemDescription(e.itemRelevanceText ?? e.rawText, input.itemDescription)
        );
        chosen = resolve(relevantActivityEvidence.length > 0 ? relevantActivityEvidence : activityEvidence);
        sourceTypeUsed = 'schedule_activity';
      }

      // Spread each candidate's weight evenly across the location(s) it resolved to.
      const perLocationWeight = new Map<string, number>();
      const perLocationEvidence = new Map<string, LocationEvidenceItem[]>();
      for (const r of chosen) {
        const share = r.candidate.weight / r.keys.length;
        for (const key of r.keys) {
          if (!contributionsByLocation.has(key)) continue; // evidence resolved outside the current corridor list
          perLocationWeight.set(key, (perLocationWeight.get(key) ?? 0) + share);
          const list = perLocationEvidence.get(key) ?? [];
          list.push({
            rawText: r.matchedText,
            sourceType: r.candidate.sourceType,
            documentName: r.candidate.documentName,
            matchConfidence: r.confidence,
            matchType: r.matchType,
          });
          perLocationEvidence.set(key, list);
        }
      }

      const totalWeight = Array.from(perLocationWeight.values()).reduce((s, v) => s + v, 0);
      if (totalWeight <= 0) {
        unallocatedPeriods.push({
          peNumber: point.peNumber,
          installedQuantity: point.installedQuantity,
          reason:
            periodEvidence.length === 0
              ? 'No POD or schedule-activity location evidence found for this period.'
              : 'Location evidence present but none of it matched a known corridor location.',
        });
        continue;
      }

      for (const [key, weight] of Array.from(perLocationWeight.entries())) {
        const weightShare = weight / totalWeight;
        const allocatedQuantity = point.installedQuantity * weightShare;
        const allocatedWorkingDays = point.workingDays !== null ? point.workingDays * weightShare : null;
        const bucket = contributionsByLocation.get(key)!;
        bucket.set(point.peNumber, {
          peNumber: point.peNumber,
          allocatedQuantity,
          weightShare,
          allocatedWorkingDays,
          sourceTypeUsed,
          periodClass: point.periodClass,
          forcedImpactByLocationEvent: false,
          evidence: perLocationEvidence.get(key) ?? [],
        });
      }
    }

    // Delay-event overlay: resolve each event's WBS to location keys, then force 'impact' on any
    // location-period pair whose dates overlap that specific event.
    const overlaidByLocation = new Map<string, OverlaidDelayEvent[]>();
    for (const loc of locationOrder) overlaidByLocation.set(loc.key, []);

    const overlaps = (aStart: string | null, aEnd: string | null, bStart: string | null, bEnd: string | null): boolean => {
      if (!aStart || !bStart) return false;
      const aS = aStart;
      const aE = aEnd ?? aStart;
      const bS = bStart;
      const bE = bEnd ?? bStart;
      return aS <= bE && bS <= aE;
    };

    for (const event of input.delayEvents) {
      const resolved = resolveLocationKeys(event.wbs, event.eventDescription, input.locations, input.overrides);
      if (!resolved) continue;
      for (const key of resolved.keys) {
        if (!contributionsByLocation.has(key)) continue;
        const bucket = contributionsByLocation.get(key)!;
        let overlappedAny = false;
        Array.from(bucket.entries()).forEach(([peNumber, contribution]) => {
          const point = input.points.find((p) => p.peNumber === peNumber);
          if (!point) return;
          if (overlaps(event.eventStartDate, event.eventFinishDate, point.periodStart, point.periodEnd)) {
            overlappedAny = true;
            bucket.set(peNumber, { ...contribution, periodClass: 'impact', forcedImpactByLocationEvent: true });
          }
        });
        const list = overlaidByLocation.get(key)!;
        list.push({
          eventId: event.eventId,
          wbs: event.wbs,
          eventDescription: event.eventDescription,
          eventStartDate: event.eventStartDate,
          eventFinishDate: event.eventFinishDate,
          impactDurationHours: event.impactDurationHours,
          overlapsProductionPeriod: overlappedAny,
        });
      }
    }

    const locations: LocationSeriesPoint[] = locationOrder.map((loc) => {
      const bucket = contributionsByLocation.get(loc.key)!;
      const contributions = Array.from(bucket.values()).sort((a, b) => a.peNumber - b.peNumber);
      const overlaidDelayEvents = overlaidByLocation.get(loc.key)!;

      if (contributions.length === 0) {
        return {
          key: loc.key,
          label: loc.label,
          stationOrder: loc.defaultStationOrder,
          approxDistanceFt: loc.defaultStationOrder * 500,
          totalAllocatedQuantity: null,
          totalAllocatedEarnedManHours: null,
          totalAllocatedWorkingDays: null,
          productionRatePerDay: null,
          dominantPeriodClass: 'no_data',
          confidenceTier: 'no_data',
          contributingPeriods: [],
          overlaidDelayEvents,
        };
      }

      const totalAllocatedQuantity = contributions.reduce((s, c) => s + c.allocatedQuantity, 0);
      const totalAllocatedWorkingDays = contributions.some((c) => c.allocatedWorkingDays !== null)
        ? contributions.reduce((s, c) => s + (c.allocatedWorkingDays ?? 0), 0)
        : null;
      const totalAllocatedEarnedManHours =
        input.manHoursPerUnit !== null ? totalAllocatedQuantity * input.manHoursPerUnit : null;
      const productionRatePerDay =
        totalAllocatedWorkingDays && totalAllocatedWorkingDays > 0 ? totalAllocatedQuantity / totalAllocatedWorkingDays : null;

      const classVotes = new Map<PeriodClass, number>();
      for (const c of contributions) {
        classVotes.set(c.periodClass, (classVotes.get(c.periodClass) ?? 0) + c.weightShare);
      }
      let dominantPeriodClass: PeriodClass = 'neutral';
      let bestVote = -1;
      for (const cls of CLASS_PRIORITY) {
        const vote = classVotes.get(cls) ?? 0;
        if (vote > bestVote) {
          bestVote = vote;
          dominantPeriodClass = cls;
        }
      }

      const totalWeightShareSum = contributions.reduce((s, c) => s + c.weightShare, 0);
      const hasPodHighConfidence = contributions.some(
        (c) =>
          c.sourceTypeUsed === 'pod_task_line' &&
          c.evidence.some((e) => e.matchConfidence === 'high' || e.matchConfidence === 'forced_override')
      );
      let confidenceTier: LocationConfidenceTier;
      if (totalWeightShareSum < 0.5) {
        confidenceTier = 'thin';
      } else if (hasPodHighConfidence) {
        confidenceTier = 'measured';
      } else {
        confidenceTier = 'estimated';
      }

      return {
        key: loc.key,
        label: loc.label,
        stationOrder: loc.defaultStationOrder,
        approxDistanceFt: loc.defaultStationOrder * 500,
        totalAllocatedQuantity,
        totalAllocatedEarnedManHours,
        totalAllocatedWorkingDays,
        productionRatePerDay,
        dominantPeriodClass,
        confidenceTier,
        contributingPeriods: contributions,
        overlaidDelayEvents,
      };
    });

    return {
      itemNo: input.itemNo,
      locations,
      unallocatedPeriods,
      unmatchedEvidenceSamples: Array.from(unmatchedSamples).slice(0, 20),
    };
  }
}
