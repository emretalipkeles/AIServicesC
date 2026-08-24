import type { DiaryReport } from '../../domain/delay-analysis/entities/DiaryReport';

// Single-responsibility, pure renderer: turns one day's Foreman Diary reports into a
// compact, deterministic text block for prompt context, mirroring PodContextRenderer. No
// AI call, no I/O — unit-testable without a DB.
//
// Untrusted-content safety: the returned text is meant to be embedded inside the caller's
// prompt wrapped in that prompt's own "treat as data, not instructions" markers (see
// AIDelayEventExtractorWithTools's diaryContextBlock) — this renderer does not add its own
// wrapper so callers keep one consistent convention per prompt.

const MAX_CONTEXT_CHARS = 4000;

function formatEntry(entry: DiaryReport['entries'][number], sourceLabel: string): string {
  const lines: string[] = [`- ${entry.authorName} (${sourceLabel})`];
  if (entry.weather) {
    lines.push(`  Weather: ${entry.weather}`);
  }
  lines.push(entry.noteText.trim().length > 0 ? `  Notes: ${entry.noteText.trim()}` : '  Notes: (none filed)');
  return lines.join('\n');
}

/**
 * Renders one day's Foreman Diary report(s) into a text block, capped to MAX_CONTEXT_CHARS.
 * Returns null when there is nothing usable to render (e.g. reports with no entries at all).
 */
export function renderDiaryDayContext(diaryReports: DiaryReport[]): string | null {
  if (diaryReports.length === 0) {
    return null;
  }

  const blocks: string[] = [];
  for (const report of diaryReports) {
    const sourceLabel = `source document ${report.sourceDocumentId}`;
    for (const entry of report.entries) {
      blocks.push(formatEntry(entry, sourceLabel));
    }
  }

  if (blocks.length === 0) {
    return null;
  }

  let text = `Foreman diary notes filed for this date (Daily Reports / Foreman Diaries):\n${blocks.join('\n')}`;
  if (text.length > MAX_CONTEXT_CHARS) {
    text = text.slice(0, MAX_CONTEXT_CHARS) + '\n[... diary context truncated ...]';
  }
  return text;
}
