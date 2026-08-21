/**
 * Best-effort fallback for POD report dates when the document body has no year
 * (e.g. "TUESDAY MARCH 25TH" with no year printed anywhere on the page).
 *
 * POD filenames in this project follow a "YYYY.MM.DD - <description>" convention
 * (e.g. "2025.03.25 - MBRT 211 POD 3.25.25.pdf"), so a leading date is a reliable
 * signal. As a secondary fallback, some filenames only carry a short M.D.YY date
 * later in the name (e.g. "POD 3.25.25.pdf") — used only if no leading date is found.
 *
 * Returns null (never throws) when no plausible date can be found, so callers can
 * chain it after the AI-extracted date without special-casing failures.
 */
export function extractDateFromFilename(filename: string): Date | null {
  const leadingMatch = filename.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (leadingMatch) {
    const date = buildDate(Number(leadingMatch[1]), Number(leadingMatch[2]), Number(leadingMatch[3]));
    if (date) return date;
  }

  // Secondary fallback: last M.D.YY or MM.DD.YYYY occurrence anywhere in the filename.
  const trailingPattern = /(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})(?!\d)/g;
  let lastTrailing: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = trailingPattern.exec(filename)) !== null) {
    lastTrailing = match;
  }
  if (lastTrailing) {
    const month = Number(lastTrailing[1]);
    const day = Number(lastTrailing[2]);
    let year = Number(lastTrailing[3]);
    if (year < 100) year += 2000;
    const date = buildDate(year, month, day);
    if (date) return date;
  }

  return null;
}

function buildDate(year: number, month: number, day: number): Date | null {
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Guards against invalid combinations like month=2, day=31 rolling over into March.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}
