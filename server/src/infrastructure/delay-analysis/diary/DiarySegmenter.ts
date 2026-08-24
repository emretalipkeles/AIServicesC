import type { DiaryEntry } from '../../../domain/delay-analysis/entities/DiaryReport';
import { PAGE_MARKER_PREFIX } from '../../document-parsing/PdfDiaryDocumentParser';

export interface DiarySegmentDay {
  /** Strict YYYY-MM-DD. */
  date: string;
  entries: DiaryEntry[];
}

export interface DiarySegmentationResult {
  days: DiarySegmentDay[];
  /** Distinct `Date:` headers encountered while walking the assembled text. */
  datesFound: number;
  /** Total diary entries (author note blocks) attributed to a day. */
  entriesFound: number;
  /** Non-blank lines that were never part of a recognised date/diary/note structure. */
  unassignedLineCount: number;
  /** Total non-blank lines walked, for computing an unassigned ratio. */
  totalLineCount: number;
}

const PAGE_MARKER = new RegExp(`^${PAGE_MARKER_PREFIX}(\\d+)$`);
const DATE_HEADER = /^Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/;
// A `Diary` header is usually its own line, with the author name on the next non-blank
// line (HeavyJob's row-label layout). Some exports instead put the author inline on the
// same line (`Diary J. Smith (jsmith)`); both are supported.
const DIARY_HEADER = /^Diary\s*(.*)$/;
const NOTE_HEADER = /^Note(\s+Note Index)?\s*$/i;
const NO_NOTES_TEXT = /^(no notes found\s*)+$/i;

type State = 'SEEKING' | 'IN_DAY' | 'AWAIT_AUTHOR' | 'AWAIT_NOTE_OR_WEATHER' | 'IN_NOTE';

/**
 * Deterministically splits a Foreman Diary document's assembled text into dated entries.
 *
 * A `Date: M/D/YYYY` header opens a new day; every subsequent `Diary` block until the next
 * date header belongs to that day. Each block's author name (including its parenthesized
 * user id), optional weather line, and note body (after the `Note` / `Note Index` markers)
 * are captured; "No notes found" is recorded as an empty note. The current date carries
 * forward across page breaks (the parser concatenates pages into one stream), so a note
 * split across two pages is reassembled as one continuous block.
 *
 * Returns a confidence signal (dates found, entries found, unassigned text) so the caller
 * can decide whether to trust this deterministic pass or fall back to an AI pass.
 */
export function segmentDiaryText(text: string): DiarySegmentationResult {
  const lines = text.split('\n');

  const days: DiarySegmentDay[] = [];
  const dayByDate = new Map<string, DiarySegmentDay>();

  let state: State = 'SEEKING';
  let currentDay: DiarySegmentDay | null = null;
  let pendingAuthor: string | null = null;
  let pendingWeather: string | null = null;
  let noteBuffer: string[] = [];
  let entrySequence = 0;

  // Page attribution: the parser inserts a PAGE_MARKER line at the start of each PDF page.
  // `pendingStartPage` is captured when a diary block opens; `pendingEndPage` tracks the
  // last page seen while that block is still being read, so a note that continues across a
  // page break still gets an accurate (start, end) page range.
  let currentPageNumber: number | null = null;
  let pendingStartPage: number | null = null;
  let pendingEndPage: number | null = null;

  let datesFound = 0;
  let entriesFound = 0;
  let unassignedLineCount = 0;
  let totalLineCount = 0;

  const finalizePendingEntry = () => {
    if (!pendingAuthor || !currentDay) {
      pendingAuthor = null;
      pendingWeather = null;
      noteBuffer = [];
      pendingStartPage = null;
      pendingEndPage = null;
      return;
    }
    const rawNote = noteBuffer.join('\n').trim();
    const noteText = NO_NOTES_TEXT.test(rawNote) ? '' : rawNote;
    currentDay.entries.push({
      sequence: entrySequence++,
      authorName: pendingAuthor,
      weather: pendingWeather,
      noteText,
      pageNumber: pendingStartPage,
      pageRangeEnd: pendingEndPage !== null && pendingEndPage !== pendingStartPage ? pendingEndPage : null,
    });
    entriesFound++;
    pendingAuthor = null;
    pendingWeather = null;
    noteBuffer = [];
    pendingStartPage = null;
    pendingEndPage = null;
  };

  const openDay = (dateKey: string) => {
    finalizePendingEntry();
    let day = dayByDate.get(dateKey);
    if (!day) {
      day = { date: dateKey, entries: [] };
      dayByDate.set(dateKey, day);
      days.push(day);
      entrySequence = 0;
    }
    currentDay = day;
    datesFound++;
    state = 'IN_DAY';
  };

  /** Starts a new diary block once the author name is already known (inline `Diary <author>` form). */
  const openDiaryBlock = (author: string) => {
    finalizePendingEntry();
    pendingAuthor = author.trim();
    pendingWeather = null;
    noteBuffer = [];
    pendingStartPage = currentPageNumber;
    pendingEndPage = currentPageNumber;
    state = 'AWAIT_NOTE_OR_WEATHER';
  };

  /** Starts a new diary block whose author name is on a following line (bare `Diary` header form). */
  const openDiaryBlockAwaitingAuthor = () => {
    finalizePendingEntry();
    pendingAuthor = null;
    pendingWeather = null;
    noteBuffer = [];
    pendingStartPage = currentPageNumber;
    pendingEndPage = currentPageNumber;
    state = 'AWAIT_AUTHOR';
  };

  /** Recognises a `Diary` header line and opens the appropriate block; returns false if the line isn't one. */
  const tryHandleDiaryHeader = (line: string): boolean => {
    const diaryMatch = DIARY_HEADER.exec(line);
    if (!diaryMatch) return false;
    const inlineAuthor = diaryMatch[1].trim();
    if (inlineAuthor.length > 0) {
      openDiaryBlock(inlineAuthor);
    } else {
      openDiaryBlockAwaitingAuthor();
    }
    return true;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const pageMatch = PAGE_MARKER.exec(line);
    if (pageMatch) {
      // Only records which page we're now on; `pendingEndPage` is stamped when a line is
      // actually consumed into the open block below, so a page break immediately followed by
      // the next Diary header doesn't wrongly extend the previous entry's page range.
      currentPageNumber = parseInt(pageMatch[1], 10);
      continue;
    }

    const isBlank = line.length === 0;
    if (!isBlank) {
      totalLineCount++;
    }

    const dateMatch = !isBlank ? DATE_HEADER.exec(line) : null;
    if (dateMatch) {
      const [, month, day, year] = dateMatch;
      const dateKey = toDateKey(month, day, year);
      if (dateKey) {
        openDay(dateKey);
        continue;
      }
    }

    if (state === 'IN_NOTE') {
      if (isBlank) {
        noteBuffer.push('');
        continue;
      }
      if (tryHandleDiaryHeader(line)) continue;
      noteBuffer.push(line);
      pendingEndPage = currentPageNumber;
      continue;
    }

    if ((state as State) === 'AWAIT_AUTHOR') {
      if (isBlank) continue;
      // A new Diary/Date header before any author line ever arrived: the previous block
      // (opened but never given an author) has nothing to finalize (finalizePendingEntry
      // is a no-op without a pendingAuthor), so just open the next one.
      if (tryHandleDiaryHeader(line)) continue;
      pendingAuthor = line;
      pendingEndPage = currentPageNumber;
      state = 'AWAIT_NOTE_OR_WEATHER';
      continue;
    }

    if ((state as State) === 'AWAIT_NOTE_OR_WEATHER') {
      if (isBlank) continue;
      if (NOTE_HEADER.test(line)) {
        state = 'IN_NOTE';
        noteBuffer = [];
        pendingEndPage = currentPageNumber;
        continue;
      }
      if (tryHandleDiaryHeader(line)) {
        // A new diary block started before this one ever reached a Note header: the
        // previous author had no note content at all.
        continue;
      }
      if (pendingWeather === null) {
        pendingWeather = line;
        pendingEndPage = currentPageNumber;
        continue;
      }
      // Unexpected second non-Note line before the Note header: not attributable, so it
      // counts against confidence rather than silently overwriting the weather line.
      unassignedLineCount++;
      continue;
    }

    // state is 'SEEKING' or 'IN_DAY'
    if (isBlank) continue;
    if (tryHandleDiaryHeader(line)) continue;
    // Stray text (leading document text before the first date, page headers we didn't
    // strip, or headerless "No notes found" placeholders with no attributable author).
    unassignedLineCount++;
  }

  finalizePendingEntry();

  return { days, datesFound, entriesFound, unassignedLineCount, totalLineCount };
}

function toDateKey(month: string, day: string, year: string): string | null {
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  let y = parseInt(year, 10);
  if (year.length === 2) {
    y += y < 70 ? 2000 : 1900;
  }
  if (!Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(y)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
}

/**
 * Whether the deterministic segmentation should be trusted as-is, or whether the layout
 * likely didn't match this document (e.g. dates found but no attributable note text, or a
 * large share of text unassigned to any day) and an AI fallback pass should run instead.
 */
export function isSegmentationReliable(result: DiarySegmentationResult): boolean {
  if (result.datesFound === 0 || result.entriesFound === 0) return false;
  if (result.totalLineCount === 0) return false;
  const unassignedRatio = result.unassignedLineCount / result.totalLineCount;
  return unassignedRatio < 0.5;
}
