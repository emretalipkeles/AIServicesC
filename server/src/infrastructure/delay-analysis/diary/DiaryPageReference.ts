import type { DiaryEntry } from '../../../domain/delay-analysis/entities/DiaryReport';

/**
 * Renders a short "p. 12" / "pp. 12–14" page reference for a diary report's entries, so
 * Results-tab evidence can point a reviewer at the exact PDF page(s) to check. Returns null
 * when no entry has page attribution (e.g. all entries came from the AI-fallback path).
 */
export function renderDiaryPageReference(entries: DiaryEntry[]): string | null {
  const starts = entries.map(e => e.pageNumber).filter((p): p is number => p !== null);
  if (starts.length === 0) return null;

  const ends = entries.map(e => e.pageRangeEnd ?? e.pageNumber).filter((p): p is number => p !== null);
  const min = Math.min(...starts);
  const max = Math.max(...ends, min);

  return min === max ? `p. ${min}` : `pp. ${min}\u2013${max}`;
}
