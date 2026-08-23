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
