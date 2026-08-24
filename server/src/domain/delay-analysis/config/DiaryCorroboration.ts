import type { DiaryReport } from '../entities/DiaryReport';

// Pure text-overlap corroboration between a delay event's description and a day's foreman
// diary notes. No I/O. Mirrors PodCandidateRanker's findPodCorroboration in spirit (keyword
// overlap against free text), but diaries have no cost-code/task-line structure to match on —
// only the note's prose — and no matcher step, so this runs once at event-creation time
// against the event description itself rather than post-match against a schedule activity.

export interface DiaryCorroboration {
  authorName: string;
  /** A short quoted excerpt of the note surrounding the matched keyword. */
  noteSnippet: string;
  matchedKeyword: string;
  /** The specific report (source document + date) whose entry corroborated this event. */
  report: DiaryReport;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'work', 'area', 'near', 'along',
  'between', 'station', 'sta', 'crew', 'phase', 'install', 'installation', 'today', 'notes',
  'weather', 'diary', 'were', 'have', 'been', 'they', 'their', 'about', 'after', 'before',
]);

function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(word => word.length >= 4 && !STOPWORDS.has(word))
  );
}

/** Quotes a short window of the note text centered on the first occurrence of `keyword`. */
function snippetAroundKeyword(noteText: string, keyword: string, radius = 60): string {
  const lowerNote = noteText.toLowerCase();
  const index = lowerNote.indexOf(keyword);
  if (index === -1) return noteText.slice(0, radius * 2).trim();

  const start = Math.max(0, index - radius);
  const end = Math.min(noteText.length, index + keyword.length + radius);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < noteText.length ? '...' : '';
  return `${prefix}${noteText.slice(start, end).trim()}${suffix}`;
}

/**
 * Finds the first diary entry (across a day's reports, in document/sequence order) whose note
 * text shares a keyword with the delay event's description, or null if no diary note
 * corroborates it. Blank ("No notes found") entries never match.
 */
export function findDiaryCorroboration(eventDescription: string, diaryReports: DiaryReport[]): DiaryCorroboration | null {
  const eventKeywords = extractKeywords(eventDescription);
  if (eventKeywords.size === 0) return null;

  for (const report of diaryReports) {
    for (const entry of report.entries) {
      if (!entry.noteText) continue;
      const noteKeywords = extractKeywords(entry.noteText);
      for (const keyword of Array.from(noteKeywords)) {
        if (eventKeywords.has(keyword)) {
          return {
            authorName: entry.authorName,
            noteSnippet: snippetAroundKeyword(entry.noteText, keyword),
            matchedKeyword: keyword,
            report,
          };
        }
      }
    }
  }

  return null;
}

/** Renders the corroboration into the same "X corroboration: ..." sentence style POD uses. */
export function renderDiaryCorroborationNote(corroboration: DiaryCorroboration): string {
  return `Diary corroboration: ${corroboration.authorName} noted "${corroboration.noteSnippet}", overlapping this event's description ("${corroboration.matchedKeyword}").`;
}
