import { z } from 'zod';
import type { DiaryEntry } from '../../../domain/delay-analysis/entities/DiaryReport';

/**
 * Validates and defensively coerces the raw AI JSON response for the Foreman Diary
 * AI-fallback pass into the domain shape. Pure logic — no database or network access — so
 * it stays independently unit-testable, mirroring PodExtractionResponseValidator: the
 * model's output is untrusted input and must be checked before anything reaches the
 * repository. Only a strict "YYYY-MM-DD" date is ever accepted, never loose `Date` parsing.
 */

const rawEntrySchema = z.object({
  authorName: z.string().optional().nullable(),
  author_name: z.string().optional().nullable(),
  weather: z.string().optional().nullable(),
  noteText: z.string().optional().nullable(),
  note_text: z.string().optional().nullable(),
}).passthrough();

const rawDaySchema = z.object({
  date: z.string().optional().nullable(),
  entries: z.array(rawEntrySchema).optional().nullable(),
}).passthrough();

const rawResponseSchema = z.object({
  days: z.array(rawDaySchema).optional().nullable(),
}).passthrough();

export interface CoercedDiaryDay {
  /** Strict YYYY-MM-DD. */
  date: string;
  entries: DiaryEntry[];
}

export interface CoercedDiaryExtraction {
  days: CoercedDiaryDay[];
}

const NO_NOTES_TEXT = /^(no notes found\s*)+$/i;

/** Accepts only a strict "YYYY-MM-DD" calendar date; returns null (never throws) otherwise. */
function coerceEntryDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return match[0];
}

function coerceEntries(raw: unknown): DiaryEntry[] {
  const result = z.array(rawEntrySchema).safeParse(raw);
  if (!result.success) return [];

  const entries: DiaryEntry[] = [];
  for (const rawEntry of result.data) {
    const authorName = (rawEntry.authorName ?? rawEntry.author_name ?? '').trim();
    if (authorName.length === 0) continue;

    const rawNote = (rawEntry.noteText ?? rawEntry.note_text ?? '').trim();
    const noteText = NO_NOTES_TEXT.test(rawNote) ? '' : rawNote;
    const weather = typeof rawEntry.weather === 'string' && rawEntry.weather.trim().length > 0
      ? rawEntry.weather.trim()
      : null;

    // AI-fallback entries come from chunked plain text, not a page-by-page PDF walk, so page
    // attribution isn't available for this path (only the deterministic PDF segmenter tracks it).
    entries.push({ sequence: entries.length, authorName, weather, noteText, pageNumber: null, pageRangeEnd: null });
  }
  return entries;
}

/**
 * Validates and coerces the raw parsed-JSON AI response. Returns null only when the response
 * has no usable shape at all (e.g. not an object); a day whose date fails strict validation
 * is dropped rather than invalidating the whole response.
 */
export function coerceDiaryExtractionResponse(raw: unknown): CoercedDiaryExtraction | null {
  const result = rawResponseSchema.safeParse(raw);
  if (!result.success) return null;

  const rawDays = result.data.days ?? [];
  const days: CoercedDiaryDay[] = [];

  for (const rawDay of rawDays) {
    const date = coerceEntryDate(rawDay.date);
    if (!date) continue;
    const entries = coerceEntries(rawDay.entries ?? []);
    days.push({ date, entries });
  }

  return { days };
}
