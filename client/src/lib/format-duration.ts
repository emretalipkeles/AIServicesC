/**
 * Formats a delay-impact duration in hours for display.
 *
 * Durations may be fractional when calculated from diary timestamp gaps (0.75h, 1.5h),
 * so whole hours must still read cleanly ("2h", not "2.00h") while fractions are preserved
 * without floating-point noise.
 */
export function formatDurationHours(hours: number | null | undefined): string | null {
  if (hours === null || hours === undefined || !isFinite(hours)) return null;
  return String(parseFloat(hours.toFixed(2)));
}

export type DurationBasis = "timestamp_derived" | "document_stated" | "estimated";

const DURATION_BASIS_LABELS: Record<DurationBasis, string> = {
  timestamp_derived: "From timestamps",
  document_stated: "Stated in document",
  estimated: "AI estimate",
};

/**
 * Human-readable label for a duration basis flag. Returns null for unrecognized or missing
 * values so callers can fall back to a "not recorded" treatment instead of showing raw codes.
 */
export function formatDurationBasis(basis: string | null | undefined): string | null {
  if (!basis) return null;
  return DURATION_BASIS_LABELS[basis as DurationBasis] ?? null;
}

/**
 * Formats the impacted clock-time window (e.g. "08:00 – 09:30") when both ends are known.
 * Returns null when either end is missing, since a partial window isn't meaningfully readable.
 */
export function formatImpactedWindow(
  start: string | null | undefined,
  end: string | null | undefined
): string | null {
  if (!start || !end) return null;
  return `${start} – ${end}`;
}

/**
 * Combines the impacted window and hours figure into a single at-a-glance string,
 * e.g. "08:00 – 09:30 (1.5 h)". Falls back to just the hours when no window is recorded.
 */
export function formatDurationWithWindow(
  hours: number | null | undefined,
  windowStart: string | null | undefined,
  windowEnd: string | null | undefined
): string | null {
  const hoursLabel = formatDurationHours(hours);
  const window = formatImpactedWindow(windowStart, windowEnd);
  if (window && hoursLabel) return `${window} (${hoursLabel} h)`;
  if (window) return window;
  if (hoursLabel) return `${hoursLabel} h`;
  return null;
}
