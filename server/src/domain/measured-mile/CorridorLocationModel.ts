// Corridor location vocabulary and free-text normalizer for the Measured Mile street/distance
// view. Pure, deterministic, no DB access -- see CorridorLocationAllocationCalculator.ts for how
// this feeds the allocation model.
//
// Pay estimates carry no location dimension (see measured-mile-performance-page.md, "Deliberately
// out of scope"). The only location vocabulary in this job's data is free text: schedule_activities
// .wbs / .activityDescription ("MADISON AND 13TH", "11TH TO 12TH SOUTH SIDE",
// "STAGE 9 (DENNY TO 23RD)") and pod_task_lines.description ("2ND / MADISON"). This module turns
// that free text into an ordered corridor position.

export type LocationMatchConfidence = 'high' | 'medium' | 'low';

export interface CanonicalCorridorLocation {
  /** Stable key, never shown to the user directly as an id. */
  key: string;
  /** Display label. */
  label: string;
  /** Default west->east sequence position. Persisted + user-editable in corridor_locations. */
  defaultStationOrder: number;
}

/**
 * Default west->east ordering along the Madison St corridor. Numbered streets 1st-24th are the
 * bulk of the vocabulary seen in this job's WBS/POD text; the five named cross-streets called out
 * in the task spec (Boren, Terry, Summit, Broadway, Denny) are interleaved at approximate
 * real-world positions. This is a BEST-GUESS DEFAULT, not an authoritative survey -- it is exactly
 * the "judgment call" the task spec says must be reviewable and editable, so it is seeded into the
 * corridor_locations table (see migration 0014) and can be reordered from the UI rather than
 * silently trusted as code.
 */
export const DEFAULT_CORRIDOR_LOCATIONS: CanonicalCorridorLocation[] = [
  { key: '1st', label: '1st Ave', defaultStationOrder: 0 },
  { key: '2nd', label: '2nd Ave', defaultStationOrder: 1 },
  { key: '3rd', label: '3rd Ave', defaultStationOrder: 2 },
  { key: '4th', label: '4th Ave', defaultStationOrder: 3 },
  { key: '5th', label: '5th Ave', defaultStationOrder: 4 },
  { key: '6th', label: '6th Ave', defaultStationOrder: 5 },
  { key: 'boren', label: 'Boren Ave', defaultStationOrder: 6 },
  { key: 'terry', label: 'Terry Ave', defaultStationOrder: 7 },
  { key: 'summit', label: 'Summit Ave', defaultStationOrder: 8 },
  { key: 'broadway', label: 'Broadway', defaultStationOrder: 9 },
  { key: '9th', label: '9th Ave', defaultStationOrder: 10 },
  { key: '10th', label: '10th Ave', defaultStationOrder: 11 },
  { key: '11th', label: '11th Ave', defaultStationOrder: 12 },
  { key: '12th', label: '12th Ave', defaultStationOrder: 13 },
  { key: '13th', label: '13th Ave', defaultStationOrder: 14 },
  { key: '14th', label: '14th Ave', defaultStationOrder: 15 },
  { key: '15th', label: '15th Ave', defaultStationOrder: 16 },
  { key: '16th', label: '16th Ave', defaultStationOrder: 17 },
  { key: '17th', label: '17th Ave', defaultStationOrder: 18 },
  { key: '18th', label: '18th Ave', defaultStationOrder: 19 },
  { key: '19th', label: '19th Ave', defaultStationOrder: 20 },
  { key: '20th', label: '20th Ave', defaultStationOrder: 21 },
  { key: '21st', label: '21st Ave', defaultStationOrder: 22 },
  { key: '22nd', label: '22nd Ave', defaultStationOrder: 23 },
  { key: 'denny', label: 'Denny Way', defaultStationOrder: 24 },
  { key: '23rd', label: '23rd Ave', defaultStationOrder: 25 },
  { key: '24th', label: '24th Ave', defaultStationOrder: 26 },
];

/** Approximate uniform spacing used only to render a distance axis; not a surveyed measurement. */
export const APPROX_STATION_SPACING_FT = 500;

const TOKEN_PATTERNS: Record<string, RegExp> = {};
for (const loc of DEFAULT_CORRIDOR_LOCATIONS) {
  // Word-boundary match on the canonical key itself (e.g. "11th", "boren"), case-insensitive.
  // "1st"/"2nd"/"3rd"/"21st"/"22nd"/"23rd" share ordinal suffixes with other numbers, so the
  // boundary anchors matter (\b11th\b will not match "111th").
  TOKEN_PATTERNS[loc.key] = new RegExp(`\\b${loc.key}\\b`, 'i');
}

const RANGE_CONNECTOR = /\b(to|thru|through)\b|[-\u2013\u2014]/i;

export interface LocationTextMatch {
  /** Canonical location keys spanned by this text, in corridor (station) order. */
  matchedKeys: string[];
  matchType: 'single' | 'range';
  confidence: LocationMatchConfidence;
  rawText: string;
}

/**
 * Extracts corridor location(s) referenced by a raw free-text string (a WBS value, an
 * activityDescription, or a POD task-line description). Returns null when no corridor token is
 * present -- callers must treat that as "no location evidence", never guess a default.
 */
export function matchLocationText(
  raw: string | null | undefined,
  locations: CanonicalCorridorLocation[] = DEFAULT_CORRIDOR_LOCATIONS
): LocationTextMatch | null {
  if (!raw || !raw.trim()) return null;
  const byStationOrder = [...locations].sort((a, b) => a.defaultStationOrder - b.defaultStationOrder);

  type Found = { key: string; index: number; stationOrder: number };
  const found: Found[] = [];
  for (const loc of byStationOrder) {
    const pattern = TOKEN_PATTERNS[loc.key];
    if (!pattern) continue;
    const match = raw.match(pattern);
    if (match && match.index !== undefined) {
      found.push({ key: loc.key, index: match.index, stationOrder: loc.defaultStationOrder });
    }
  }

  if (found.length === 0) return null;

  found.sort((a, b) => a.index - b.index);

  if (found.length === 1) {
    return { matchedKeys: [found[0].key], matchType: 'single', confidence: 'high', rawText: raw };
  }

  // Two or more tokens: treat as a range spanning every canonical location between the first and
  // last occurrence (inclusive), ordered by station -- e.g. "STAGE 9 (DENNY TO 23RD)" spans every
  // canonical location from Denny through 23rd, not just those two named ones.
  const minStation = Math.min(...found.map((f) => f.stationOrder));
  const maxStation = Math.max(...found.map((f) => f.stationOrder));
  const spanKeys = byStationOrder
    .filter((l) => l.defaultStationOrder >= minStation && l.defaultStationOrder <= maxStation)
    .map((l) => l.key);

  const hasExplicitConnector = RANGE_CONNECTOR.test(raw);
  const spanLength = spanKeys.length;
  // A tight, explicitly-connected 2-3 station span ("11TH TO 12TH") is a real, precise block
  // reference. A wider or connector-less span (many tokens, or "AND"-joined intersections without
  // a clear from/to) is a much looser locator, so it is marked lower confidence rather than
  // silently trusted at the same level.
  const confidence: LocationMatchConfidence =
    hasExplicitConnector && spanLength <= 3 ? 'high' : hasExplicitConnector && spanLength <= 6 ? 'medium' : 'low';

  return { matchedKeys: spanKeys, matchType: 'range', confidence, rawText: raw };
}

const ITEM_KEYWORD_STOPWORDS = new Set([
  'and',
  'the',
  'for',
  'with',
  'from',
  'side',
  'south',
  'north',
  'east',
  'west',
  'install',
  'installation',
  'removal',
  'remove',
  'work',
  'each',
  'various',
]);

/**
 * Heuristic keyword overlap between a bid item's description and a schedule activity's
 * description, used only as the fallback location-evidence source when POD cost-code crosswalk
 * data is unavailable for a period (see task spec). Approximate by design -- flagged as a lower
 * confidence source in the allocation calculator, never treated as an exact join.
 */
export function activityMatchesItemDescription(activityDescription: string, itemDescription: string | null): boolean {
  if (!itemDescription) return false;
  const upperActivity = activityDescription.toUpperCase();
  const words = itemDescription
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w.length >= 4 && !ITEM_KEYWORD_STOPWORDS.has(w.toLowerCase()));
  return words.some((w) => new RegExp(`\\b${w}\\b`).test(upperActivity));
}
