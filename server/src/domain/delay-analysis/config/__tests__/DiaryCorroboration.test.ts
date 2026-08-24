import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { findDiaryCorroboration, renderDiaryCorroborationNote } from '../DiaryCorroboration';
import { DiaryReport, DiaryEntry } from '../../entities/DiaryReport';

function makeEntry(overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    sequence: 0,
    authorName: 'J. Smith (jsmith)',
    weather: 'Clear, 72F',
    noteText: 'Crew waited on utility locates until noon.',
    pageNumber: 12,
    pageRangeEnd: null,
    ...overrides,
  };
}

function makeReport(entries: DiaryEntry[], sourceDocumentId = 'diary-doc-1'): DiaryReport {
  return new DiaryReport({
    id: randomUUID(),
    sourceDocumentId,
    projectId: 'proj-1',
    tenantId: 'tenant-1',
    reportDate: new Date('2021-09-23'),
    sequence: 0,
    extractionMethod: 'deterministic',
    entries,
  });
}

describe('findDiaryCorroboration', () => {
  it('corroborates via a keyword shared between the note text and the event description', () => {
    const report = makeReport([makeEntry()]);

    const corroboration = findDiaryCorroboration(
      'Excavation delayed pending utility locates',
      [report]
    );

    expect(corroboration).not.toBeNull();
    expect(corroboration?.authorName).toBe('J. Smith (jsmith)');
    expect(corroboration?.matchedKeyword).toBe('utility');
    expect(corroboration?.noteSnippet).toContain('utility locates');
    expect(corroboration?.report).toBe(report);
  });

  it('returns null when no diary note shares a keyword with the event description', () => {
    const report = makeReport([makeEntry({ noteText: 'Concrete pour proceeded as scheduled.' })]);

    const corroboration = findDiaryCorroboration(
      'Rebar inspection delayed pending engineer approval',
      [report]
    );

    expect(corroboration).toBeNull();
  });

  it('skips blank ("No notes found") entries rather than matching on empty text', () => {
    const report = makeReport([
      makeEntry({ sequence: 0, authorName: 'A. Author (aauthor)', noteText: '' }),
      makeEntry({ sequence: 1, authorName: 'B. Author (bauthor)', noteText: 'Waiting on utility locates before excavation could proceed.' }),
    ]);

    const corroboration = findDiaryCorroboration('Excavation delayed pending utility locates', [report]);

    expect(corroboration?.authorName).toBe('B. Author (bauthor)');
  });

  it('checks reports in the given order and returns the first match across multiple source documents', () => {
    const reportA = makeReport([makeEntry({ noteText: 'Paving crew finished early, no issues.' })], 'diary-doc-A');
    const reportB = makeReport([makeEntry({ noteText: 'Crew waited on utility locates until noon.' })], 'diary-doc-B');

    const corroboration = findDiaryCorroboration('Excavation delayed pending utility locates', [reportA, reportB]);

    expect(corroboration?.report.sourceDocumentId).toBe('diary-doc-B');
  });

  it('returns null when the event description has no meaningful (non-stopword) keywords', () => {
    const report = makeReport([makeEntry()]);

    const corroboration = findDiaryCorroboration('the and for with', [report]);

    expect(corroboration).toBeNull();
  });
});

describe('renderDiaryCorroborationNote', () => {
  it('renders a POD-style corroboration sentence naming the author and quoting the note', () => {
    const report = makeReport([makeEntry()]);
    const corroboration = findDiaryCorroboration('Excavation delayed pending utility locates', [report])!;

    const note = renderDiaryCorroborationNote(corroboration);

    expect(note).toBe(
      'Diary corroboration: J. Smith (jsmith) noted "Crew waited on utility locates until noon.", overlapping this event\'s description ("utility").'
    );
  });
});
