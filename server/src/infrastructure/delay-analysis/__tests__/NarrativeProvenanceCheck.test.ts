import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  containsNarrativeTimestamps,
  sourceReferenceHasTimestamp,
  auditNarrativeProvenance,
} from '../NarrativeProvenanceCheck';

describe('NarrativeProvenanceCheck timestamp detection', () => {
  it('detects the clock formats inspectors actually write', () => {
    expect(containsNarrativeTimestamps('7:00 AM Concrete crew is onsite')).toBe(true);
    expect(containsNarrativeTimestamps('At 1415 excavation stopped')).toBe(true);
    expect(containsNarrativeTimestamps('0730hrs crew mobilized')).toBe(true);
    expect(containsNarrativeTimestamps('resumed at 14:30')).toBe(true);
    expect(containsNarrativeTimestamps('offsite 3pm')).toBe(true);
  });

  it('does not treat a calendar date as a narrative timestamp', () => {
    // A four-digit year parses as military time unless dates are excluded, which would make every
    // report header look like a timestamped narrative and render this audit meaningless.
    expect(containsNarrativeTimestamps('Date: 6/1/2022 Inspector: T. Russell')).toBe(false);
    expect(containsNarrativeTimestamps('Contract awarded in 2019 under PW# 2019-069')).toBe(false);
    expect(containsNarrativeTimestamps('Rev. 7/15 form C-39')).toBe(false);
    expect(sourceReferenceHasTimestamp('Discrepancies section, report dated 6/9/2022')).toBe(false);
  });

  it('detects a four-digit time span, including evening shifts', () => {
    // Inspectors cite stoppages as a window, and the bare-time branch alone rejects both halves:
    // the hyphen reads as date punctuation and evening times fall outside its 0000-1859 ceiling.
    expect(containsNarrativeTimestamps('Diary 0830-0845 rebar cage moved')).toBe(true);
    expect(containsNarrativeTimestamps('Diary 0730-1400: panels replaced')).toBe(true);
    expect(containsNarrativeTimestamps('Civil #7 1900 – 2100 night shift')).toBe(true);
    expect(sourceReferenceHasTimestamp('Diary 0730-1400: At 3rd/Madison, panels damaged')).toBe(true);
    expect(sourceReferenceHasTimestamp('Contract Work Performed, Civil #7 1900—2100: night pour')).toBe(true);
    // A hyphenated calendar date must still not qualify — its second half is two digits, not four.
    expect(containsNarrativeTimestamps('Report dated 2022-06-14 by M. Mansfield')).toBe(false);
  });

  it('does not treat other four-digit ranges in a report as a time span', () => {
    // Inspector reports are full of numeric ranges that read as HHMM-HHMM. Without a time cue or a
    // closing colon these must not count, or the audit would call every report timestamped.
    expect(containsNarrativeTimestamps('Project No. 2023-2024 close-out')).toBe(false);
    expect(containsNarrativeTimestamps('Rev. 2019-2020 of the C-39 form')).toBe(false);
    expect(containsNarrativeTimestamps('Qty: 1200-1400 LF of conduit')).toBe(false);
    expect(containsNarrativeTimestamps('Elev. 0830-0845 at the SW corner')).toBe(false);
    expect(containsNarrativeTimestamps('Station 0730-1400 along Madison')).toBe(false);
    // Out-of-range values are not times in any form.
    expect(containsNarrativeTimestamps('Diary 2465-2599 pipe run')).toBe(false);
  });

  it('recognizes a timestamp cited at the start of a source reference', () => {
    expect(sourceReferenceHasTimestamp('Diary, 0730: panels damaged during removal')).toBe(true);
    expect(sourceReferenceHasTimestamp('Contract Work Performed section, Page 1')).toBe(false);
    expect(sourceReferenceHasTimestamp(null)).toBe(false);
  });
});

describe('auditNarrativeProvenance', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    log.mockRestore();
  });

  const timestampedDoc = '0730 Panels removed at 3rd/Madison\n1000 Sawcutter onsite\n1400 Panels removed';

  it('warns when a timestamped IDR produces zero events', () => {
    const stats = auditNarrativeProvenance('[TEST]', 'idr', 'idr.pdf', timestampedDoc, []);

    expect(stats.documentHasTimestamps).toBe(true);
    expect(stats.eventsChecked).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ZERO delay events'));
  });

  it('warns for events that cite no timestamp despite a timestamped narrative', () => {
    const stats = auditNarrativeProvenance('[TEST]', 'idr', 'idr.pdf', timestampedDoc, [
      { sourceReference: 'Diary, 0730: damaged two new panels', eventDescription: 'Panel damage' },
      { sourceReference: 'Contract Work Performed section', eventDescription: 'Wrong saddle size' },
    ]);

    expect(stats.eventsWithTimestamp).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('1 of 2 event(s) have no timestamp'));
  });

  it('stays silent for non-IDR documents', () => {
    auditNarrativeProvenance('[TEST]', 'ncr', 'ncr.pdf', timestampedDoc, []);
    expect(warn).not.toHaveBeenCalled();
  });

  it('never modifies or drops the events it audits', () => {
    const events = [{ sourceReference: null, eventDescription: 'Unreferenced event' }];
    const snapshot = JSON.parse(JSON.stringify(events));

    auditNarrativeProvenance('[TEST]', 'idr', 'idr.pdf', timestampedDoc, events);

    expect(events).toEqual(snapshot);
  });
});
