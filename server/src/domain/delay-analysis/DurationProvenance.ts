import type { DurationBasis } from './entities/ContractorDelayEvent';

const CLOCK_TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export const VALID_DURATION_BASES: ReadonlySet<string> = new Set<DurationBasis>([
  'timestamp_derived',
  'document_stated',
  'estimated',
  'bounded_by_next_entry',
]);

/**
 * Ceiling on a 'bounded_by_next_entry' window. A next narrative entry many hours later is
 * not evidence the delay itself lasted that long — beyond this cap the claim is not
 * credible as a calculated duration and must be downgraded to 'estimated' instead of
 * inflating the figure. Referenced from extraction prompts so the ceiling lives in one place.
 */
export const MAX_BOUNDED_WINDOW_HOURS = 4;

/**
 * Normalizes a raw window clock-time string (e.g. "8:00", "08:00", "0800") into "HH:MM",
 * or null when the value is missing/unparseable. Used for both extraction-contract fields
 * (impactedWindowStart/End) so all extractors validate identically instead of trusting the
 * model's raw string verbatim.
 */
export function normalizeClockTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Accept "HH:MM" directly.
  if (CLOCK_TIME_PATTERN.test(trimmed)) {
    const [h, m] = trimmed.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }

  // Accept bare 3-4 digit military time ("0800", "800").
  const militaryMatch = trimmed.match(/^(\d{1,2})(\d{2})$/);
  if (militaryMatch) {
    const hours = parseInt(militaryMatch[1], 10);
    const minutes = parseInt(militaryMatch[2], 10);
    if (hours <= 23 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Validates a raw duration-basis string against the known enum, defaulting to null (not
 * recorded) rather than guessing when the model returns something unexpected.
 */
export function normalizeDurationBasis(raw: unknown): DurationBasis | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  return VALID_DURATION_BASES.has(trimmed) ? (trimmed as DurationBasis) : null;
}

/**
 * Derives an unambiguous event finish Date from the event's start date and the impacted
 * window's end clock time. Only returns a value when the window is fully known AND the end
 * time is not earlier than the start time (which would imply crossing midnight — ambiguous
 * without more context, so left null rather than guessed).
 */
export function deriveEventFinishDate(
  eventStartDate: Date | null,
  windowStart: string | null,
  windowEnd: string | null
): Date | null {
  if (!eventStartDate || !windowStart || !windowEnd) return null;

  const startMatch = windowStart.match(/^(\d{2}):(\d{2})$/);
  const endMatch = windowEnd.match(/^(\d{2}):(\d{2})$/);
  if (!startMatch || !endMatch) return null;

  const startMinutes = parseInt(startMatch[1], 10) * 60 + parseInt(startMatch[2], 10);
  const endMinutes = parseInt(endMatch[1], 10) * 60 + parseInt(endMatch[2], 10);
  if (endMinutes <= startMinutes) return null;

  const finishDate = new Date(eventStartDate);
  finishDate.setHours(parseInt(endMatch[1], 10), parseInt(endMatch[2], 10), 0, 0);
  return finishDate;
}

/**
 * Enforces the evidence requirements for the 'bounded_by_next_entry' basis server-side —
 * the model must not be able to assert this basis without the window that justifies it.
 * A claim is only honored when both window clock times are present, strictly increasing
 * (same-day, non-midnight-crossing), and the resulting span is within MAX_BOUNDED_WINDOW_HOURS;
 * a next entry many hours later is not evidence the delay itself lasted that long. Any other
 * basis passes through unchanged — this only guards the one basis that needs a runtime check.
 */
export function resolveDurationBasis(
  basis: DurationBasis | null,
  windowStart: string | null,
  windowEnd: string | null
): DurationBasis | null {
  if (basis !== 'bounded_by_next_entry') return basis;

  const startMatch = windowStart?.match(/^(\d{2}):(\d{2})$/);
  const endMatch = windowEnd?.match(/^(\d{2}):(\d{2})$/);
  if (!startMatch || !endMatch) return 'estimated';

  const startMinutes = parseInt(startMatch[1], 10) * 60 + parseInt(startMatch[2], 10);
  const endMinutes = parseInt(endMatch[1], 10) * 60 + parseInt(endMatch[2], 10);
  if (endMinutes <= startMinutes) return 'estimated';

  const spanHours = (endMinutes - startMinutes) / 60;
  if (spanHours > MAX_BOUNDED_WINDOW_HOURS) return 'estimated';

  return 'bounded_by_next_entry';
}

export interface DurationProvenanceInput {
  rawBasis: unknown;
  rawWindowStart: unknown;
  rawWindowEnd: unknown;
  rawImpactDurationHours: number | null;
  eventStartDate: Date | null;
}

export interface DurationProvenanceResult {
  durationBasis: DurationBasis | null;
  windowStart: string | null;
  windowEnd: string | null;
  impactDurationHours: number | null;
  eventFinishDate: Date | null;
  /**
   * Set only when a 'bounded_by_next_entry' claim was rejected, explaining why the window was
   * discarded and the duration capped, so a reviewer sees the reasoning behind an "AI estimate"
   * that happens to land at exactly MAX_BOUNDED_WINDOW_HOURS instead of assuming it was guessed
   * from nothing. Null whenever no bounded claim was made or the claim was accepted.
   */
  rejectedBoundedClaimNote: string | null;
}

/**
 * Explains why a claimed 'bounded_by_next_entry' basis was rejected, in reviewer-facing prose.
 * Mirrors the same checks as resolveDurationBasis (incomplete window / non-increasing window /
 * span over the cap) so the two never disagree about *why* a claim failed.
 */
function describeBoundedClaimRejection(windowStart: string | null, windowEnd: string | null): string {
  const startMatch = windowStart?.match(/^(\d{2}):(\d{2})$/);
  const endMatch = windowEnd?.match(/^(\d{2}):(\d{2})$/);

  if (!startMatch || !endMatch) {
    return `AI estimate: the source claimed this event's duration was bounded by the next narrative entry, but the impacted time window was incomplete, so the claim was rejected and the duration capped at ${MAX_BOUNDED_WINDOW_HOURS}h.`;
  }

  const startMinutes = parseInt(startMatch[1], 10) * 60 + parseInt(startMatch[2], 10);
  const endMinutes = parseInt(endMatch[1], 10) * 60 + parseInt(endMatch[2], 10);
  if (endMinutes <= startMinutes) {
    return `AI estimate: the source claimed this event's duration was bounded by the next narrative entry (${windowStart}\u2013${windowEnd}), but the window did not increase (or crossed midnight), so the claim was rejected and the duration capped at ${MAX_BOUNDED_WINDOW_HOURS}h.`;
  }

  const spanHours = Math.round(((endMinutes - startMinutes) / 60) * 100) / 100;
  return `AI estimate: the source claimed this event's duration was bounded by the next narrative entry (${windowStart}\u2013${windowEnd}, ${spanHours}h), which exceeds the ${MAX_BOUNDED_WINDOW_HOURS}h credibility cap for a "next entry" gap, so the claim was rejected and the duration capped at ${MAX_BOUNDED_WINDOW_HOURS}h.`;
}

/**
 * Single entry point combining normalization, the 'bounded_by_next_entry' evidence guard, and
 * finish-date derivation, so a rejected bounded claim cannot leak into persisted data as a
 * disguised estimate. When a claim is rejected (incomplete window, non-increasing window, or a
 * span over MAX_BOUNDED_WINDOW_HOURS), the unsubstantiated window is cleared — it is not
 * evidence for whatever basis the event falls back to — and the reported duration is capped at
 * MAX_BOUNDED_WINDOW_HOURS, since the only support offered for a larger figure was the rejected
 * gap. eventFinishDate is always derived from the (possibly cleared) window, never the raw one.
 */
export function resolveDurationProvenance(input: DurationProvenanceInput): DurationProvenanceResult {
  const rawWindowStart = normalizeClockTime(input.rawWindowStart);
  const rawWindowEnd = normalizeClockTime(input.rawWindowEnd);
  const rawBasis = normalizeDurationBasis(input.rawBasis);
  const claimedBounded = rawBasis === 'bounded_by_next_entry';

  const resolvedBasis = resolveDurationBasis(rawBasis, rawWindowStart, rawWindowEnd);
  const accepted = resolvedBasis === 'bounded_by_next_entry';
  const rejected = claimedBounded && !accepted;

  // Computed from the raw (pre-clear) window, since that is the claim being explained.
  const rejectedBoundedClaimNote = rejected
    ? describeBoundedClaimRejection(rawWindowStart, rawWindowEnd)
    : null;

  const windowStart = rejected ? null : rawWindowStart;
  const windowEnd = rejected ? null : rawWindowEnd;

  // For an accepted bounded claim, the window IS the evidence for the duration — the next entry's
  // timestamp determines the figure, so the calculated span always wins over whatever number the
  // model separately reported (which could otherwise disagree with, or wildly exceed, the window
  // it just validated). Both times are already known-valid HH:MM at this point (resolveDurationBasis
  // only accepts a complete, strictly increasing, same-day pair), so the match here cannot fail.
  const boundedSpanHours = accepted
    ? computeSameDaySpanHours(windowStart, windowEnd)
    : null;

  const impactDurationHours = accepted && boundedSpanHours !== null
    ? boundedSpanHours
    : rejected && input.rawImpactDurationHours != null
      ? Math.min(input.rawImpactDurationHours, MAX_BOUNDED_WINDOW_HOURS)
      : input.rawImpactDurationHours;

  return {
    durationBasis: resolvedBasis,
    windowStart,
    windowEnd,
    impactDurationHours,
    eventFinishDate: deriveEventFinishDate(input.eventStartDate, windowStart, windowEnd),
    rejectedBoundedClaimNote,
  };
}

function computeSameDaySpanHours(windowStart: string | null, windowEnd: string | null): number | null {
  const startMatch = windowStart?.match(/^(\d{2}):(\d{2})$/);
  const endMatch = windowEnd?.match(/^(\d{2}):(\d{2})$/);
  if (!startMatch || !endMatch) return null;

  const startMinutes = parseInt(startMatch[1], 10) * 60 + parseInt(startMatch[2], 10);
  const endMinutes = parseInt(endMatch[1], 10) * 60 + parseInt(endMatch[2], 10);
  if (endMinutes <= startMinutes) return null;

  return Math.round(((endMinutes - startMinutes) / 60) * 100) / 100;
}
