import { describe, it, expect } from 'vitest';
import { segmentDiaryText, isSegmentationReliable } from '../DiarySegmenter';
import { PAGE_MARKER_PREFIX } from '../../../document-parsing/PdfDiaryDocumentParser';

describe('segmentDiaryText', () => {
  it('splits multiple diary blocks under one date into separate entries', () => {
    const text = [
      'Date: 9/23/2021',
      'Diary J. Smith (jsmith)',
      'Clear, 72F',
      'Note',
      'Crew arrived on site at 7am.',
      'Diary R. Jones (rjones)',
      'Note',
      'Waiting on concrete delivery all morning.',
    ].join('\n');

    const result = segmentDiaryText(text);

    expect(result.days).toHaveLength(1);
    expect(result.days[0].date).toBe('2021-09-23');
    expect(result.days[0].entries).toHaveLength(2);

    const [first, second] = result.days[0].entries;
    expect(first.authorName).toBe('J. Smith (jsmith)');
    expect(first.weather).toBe('Clear, 72F');
    expect(first.noteText).toBe('Crew arrived on site at 7am.');

    expect(second.authorName).toBe('R. Jones (rjones)');
    expect(second.weather).toBeNull();
    expect(second.noteText).toBe('Waiting on concrete delivery all morning.');

    expect(result.datesFound).toBe(1);
    expect(result.entriesFound).toBe(2);
    expect(isSegmentationReliable(result)).toBe(true);
  });

  it('keeps a note continuing across a page break as one continuous block', () => {
    // A page break just means more assembled text lines with no new Date/Diary header
    // in between, since the parser concatenates pages into a single stream.
    const text = [
      'Date: 9/24/2021',
      'Diary J. Smith (jsmith)',
      'Note',
      'Closed the east gate at 3pm due to',
      'a utility conflict discovered during excavation.',
      'Crew stood down for the remainder of the shift.',
    ].join('\n');

    const result = segmentDiaryText(text);

    expect(result.days).toHaveLength(1);
    expect(result.days[0].entries).toHaveLength(1);
    expect(result.days[0].entries[0].noteText).toBe(
      'Closed the east gate at 3pm due to\na utility conflict discovered during excavation.\nCrew stood down for the remainder of the shift.'
    );
  });

  it('records "No notes found" blocks as an empty note rather than note text', () => {
    const text = [
      'Date: 9/25/2021',
      'Diary J. Smith (jsmith)',
      'Note',
      'No notes found',
    ].join('\n');

    const result = segmentDiaryText(text);

    expect(result.days[0].entries).toHaveLength(1);
    expect(result.days[0].entries[0].noteText).toBe('');
  });

  it('captures a weather line when present and leaves it null when absent', () => {
    const withWeather = segmentDiaryText(
      ['Date: 9/26/2021', 'Diary A. Foreman (af1)', 'Sunny, 65F', 'Note', 'All quiet.'].join('\n')
    );
    expect(withWeather.days[0].entries[0].weather).toBe('Sunny, 65F');

    const withoutWeather = segmentDiaryText(
      ['Date: 9/26/2021', 'Diary A. Foreman (af1)', 'Note', 'All quiet.'].join('\n')
    );
    expect(withoutWeather.days[0].entries[0].weather).toBeNull();
  });

  it('carries the current date forward across multiple diary blocks and pages', () => {
    const text = [
      'Date: 9/27/2021',
      'Diary A. Foreman (af1)',
      'Note',
      'Morning work proceeded normally.',
      // simulated page break furniture would already be stripped before this stage
      'Diary B. Foreman (bf1)',
      'Note',
      'Afternoon crew waited on inspector.',
    ].join('\n');

    const result = segmentDiaryText(text);
    expect(result.days).toHaveLength(1);
    expect(result.days[0].date).toBe('2021-09-27');
    expect(result.days[0].entries).toHaveLength(2);
  });

  it('reports low confidence when no dated entries are found at all', () => {
    const text = 'This document has no recognisable diary structure at all.\nJust prose.';
    const result = segmentDiaryText(text);

    expect(result.days).toHaveLength(0);
    expect(result.datesFound).toBe(0);
    expect(isSegmentationReliable(result)).toBe(false);
  });

  it('reports low confidence when dates are found but no note text is attributable', () => {
    const text = [
      'Date: 9/28/2021',
      'Some stray unattributed text that never matches a Diary header',
      'More stray text',
      'Even more unrecognised text that dominates the page',
    ].join('\n');

    const result = segmentDiaryText(text);
    expect(result.datesFound).toBe(1);
    expect(result.entriesFound).toBe(0);
    expect(isSegmentationReliable(result)).toBe(false);
  });

  it('handles the real HeavyJob layout where "Diary" is alone on its own line and the author follows on the next line', () => {
    // This is the actual shape produced by the sample export: the "Diary" row label and the
    // author name land on separate lines after visual-order text assembly.
    const text = [
      'Date: 10/7/2021',
      'Diary',
      'Hansen, Justin (HANSEN,JUS)',
      'Note    Note Index',
      'Pre Madison meeting',
      'Diary',
      'Hill, Theodore J. (HILL,TJ)',
      'Note    Note Index',
      'Today we had a kick off meeting at the delridge office for the Madison',
      'project.',
    ].join('\n');

    const result = segmentDiaryText(text);

    expect(result.days).toHaveLength(1);
    expect(result.days[0].entries).toHaveLength(2);
    expect(result.days[0].entries[0].authorName).toBe('Hansen, Justin (HANSEN,JUS)');
    expect(result.days[0].entries[0].noteText).toBe('Pre Madison meeting');
    expect(result.days[0].entries[1].authorName).toBe('Hill, Theodore J. (HILL,TJ)');
    expect(result.days[0].entries[1].noteText).toBe(
      'Today we had a kick off meeting at the delridge office for the Madison\nproject.'
    );
    expect(isSegmentationReliable(result)).toBe(true);
  });

  it('captures a weather descriptor line placed between the author and the Note header in the real layout', () => {
    const text = [
      'Date: 10/25/2021',
      'Diary',
      'Solt, Bruce (SOLT,BRU)',
      'Cool - (45 - 60); Partly Sunny / Cloudy',
      'Note    Note Index',
      'Civil 1 working in yard helping out with tree boxes.',
    ].join('\n');

    const result = segmentDiaryText(text);
    expect(result.days[0].entries[0].weather).toBe('Cool - (45 - 60); Partly Sunny / Cloudy');
    expect(result.days[0].entries[0].noteText).toBe('Civil 1 working in yard helping out with tree boxes.');
  });

  it('treats a run of merged "No notes found" placeholders as an empty note', () => {
    const text = [
      'Date: 10/25/2021',
      'Diary',
      'Solt, Bruce (SOLT,BRU)',
      'Note    Note Index',
      'No notes found    No notes found    No notes found',
    ].join('\n');

    const result = segmentDiaryText(text);
    expect(result.days[0].entries).toHaveLength(1);
    expect(result.days[0].entries[0].noteText).toBe('');
  });

  it('parses a date-range style document by treating each Date header independently', () => {
    // A filename like "21.09.23-10.30.pdf" covers a range, but segmentation only ever
    // depends on in-body `Date:` headers, not the filename.
    const text = [
      'Date: 9/23/2021',
      'Diary A. Foreman (af1)',
      'Note',
      'Day one notes.',
      'Date: 10/30/2021',
      'Diary A. Foreman (af1)',
      'Note',
      'Last day notes.',
    ].join('\n');

    const result = segmentDiaryText(text);
    expect(result.days).toHaveLength(2);
    expect(result.days[0].date).toBe('2021-09-23');
    expect(result.days[1].date).toBe('2021-10-30');
  });

  it('attributes an entry to the PDF page it started on', () => {
    const text = [
      `${PAGE_MARKER_PREFIX}12`,
      'Date: 9/23/2021',
      'Diary J. Smith (jsmith)',
      'Note',
      'Crew arrived on site at 7am.',
    ].join('\n');

    const result = segmentDiaryText(text);
    expect(result.days[0].entries[0].pageNumber).toBe(12);
    expect(result.days[0].entries[0].pageRangeEnd).toBeNull();
  });

  it('records a page range when a note continues across a page break', () => {
    const text = [
      `${PAGE_MARKER_PREFIX}12`,
      'Date: 9/24/2021',
      'Diary J. Smith (jsmith)',
      'Note',
      'Closed the east gate at 3pm due to',
      `${PAGE_MARKER_PREFIX}13`,
      'a utility conflict discovered during excavation.',
    ].join('\n');

    const result = segmentDiaryText(text);
    expect(result.days[0].entries).toHaveLength(1);
    expect(result.days[0].entries[0].noteText).toBe(
      'Closed the east gate at 3pm due to\na utility conflict discovered during excavation.'
    );
    expect(result.days[0].entries[0].pageNumber).toBe(12);
    expect(result.days[0].entries[0].pageRangeEnd).toBe(13);
  });

  it('gives each entry under a date its own start page when a new Diary block opens on the next page', () => {
    const text = [
      `${PAGE_MARKER_PREFIX}20`,
      'Date: 9/25/2021',
      'Diary J. Smith (jsmith)',
      'Note',
      'First author note.',
      `${PAGE_MARKER_PREFIX}21`,
      'Diary R. Jones (rjones)',
      'Note',
      'Second author note.',
    ].join('\n');

    const result = segmentDiaryText(text);
    expect(result.days[0].entries).toHaveLength(2);
    expect(result.days[0].entries[0].pageNumber).toBe(20);
    expect(result.days[0].entries[0].pageRangeEnd).toBeNull();
    expect(result.days[0].entries[1].pageNumber).toBe(21);
    expect(result.days[0].entries[1].pageRangeEnd).toBeNull();
  });
});
