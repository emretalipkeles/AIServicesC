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
