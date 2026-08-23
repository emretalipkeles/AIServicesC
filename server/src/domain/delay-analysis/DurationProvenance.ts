import type { DurationBasis } from './entities/ContractorDelayEvent';

const CLOCK_TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const VALID_DURATION_BASES: ReadonlySet<string> = new Set<DurationBasis>([
  'timestamp_derived',
  'document_stated',
  'estimated',
]);

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
