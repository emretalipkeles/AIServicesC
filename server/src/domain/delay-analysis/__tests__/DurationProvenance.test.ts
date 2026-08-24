import { describe, it, expect } from 'vitest';
import {
  normalizeDurationBasis,
  resolveDurationBasis,
  resolveDurationProvenance,
  MAX_BOUNDED_WINDOW_HOURS,
} from '../DurationProvenance';

describe('normalizeDurationBasis', () => {
  it('accepts the new bounded_by_next_entry basis', () => {
    expect(normalizeDurationBasis('bounded_by_next_entry')).toBe('bounded_by_next_entry');
  });

  it('still accepts the pre-existing bases', () => {
    expect(normalizeDurationBasis('timestamp_derived')).toBe('timestamp_derived');
    expect(normalizeDurationBasis('document_stated')).toBe('document_stated');
    expect(normalizeDurationBasis('estimated')).toBe('estimated');
  });

  it('rejects unknown strings', () => {
    expect(normalizeDurationBasis('guessed')).toBeNull();
  });
});

/**
 * resolveDurationBasis is the server-side guard: the model must not be able to assert
 * 'bounded_by_next_entry' without the window that actually justifies it.
 */
describe('resolveDurationBasis', () => {
  it('passes through non-bounded bases unchanged, regardless of window', () => {
    expect(resolveDurationBasis('timestamp_derived', null, null)).toBe('timestamp_derived');
    expect(resolveDurationBasis('document_stated', null, null)).toBe('document_stated');
    expect(resolveDurationBasis('estimated', null, null)).toBe('estimated');
    expect(resolveDurationBasis(null, '13:00', '15:30')).toBeNull();
  });

  it('honors a bounded claim with a complete, plausible, strictly-increasing window', () => {
    expect(resolveDurationBasis('bounded_by_next_entry', '13:00', '15:30')).toBe('bounded_by_next_entry');
  });

  it('downgrades to estimated when either window end is missing', () => {
    expect(resolveDurationBasis('bounded_by_next_entry', '13:00', null)).toBe('estimated');
    expect(resolveDurationBasis('bounded_by_next_entry', null, '15:30')).toBe('estimated');
    expect(resolveDurationBasis('bounded_by_next_entry', null, null)).toBe('estimated');
  });

  it('downgrades to estimated when the window is not strictly increasing', () => {
    expect(resolveDurationBasis('bounded_by_next_entry', '15:30', '15:30')).toBe('estimated');
    expect(resolveDurationBasis('bounded_by_next_entry', '15:30', '13:00')).toBe('estimated');
  });

  it('downgrades to estimated when the span exceeds the sanity cap', () => {
    const start = '08:00';
    const overCapEnd = `${String(8 + MAX_BOUNDED_WINDOW_HOURS + 1).padStart(2, '0')}:00`;
    expect(resolveDurationBasis('bounded_by_next_entry', start, overCapEnd)).toBe('estimated');
  });

  it('honors a span exactly at the sanity cap', () => {
    const start = '08:00';
    const atCapEnd = `${String(8 + MAX_BOUNDED_WINDOW_HOURS).padStart(2, '0')}:00`;
    expect(resolveDurationBasis('bounded_by_next_entry', start, atCapEnd)).toBe('bounded_by_next_entry');
  });
});

/**
 * resolveDurationProvenance wires the guard into persistence: a rejected bounded claim must not
 * leak its unsubstantiated window or an inflated duration into the saved event as a disguised
 * estimate (regression coverage for a defect a code-review round caught before this shipped).
 */
describe('resolveDurationProvenance', () => {
  const eventStartDate = new Date('2021-11-16T00:00:00.000Z');

  it('keeps a valid bounded claim intact, including its derived finish date', () => {
    const result = resolveDurationProvenance({
      rawBasis: 'bounded_by_next_entry',
      rawWindowStart: '13:00',
      rawWindowEnd: '15:30',
      rawImpactDurationHours: 2.5,
      eventStartDate,
    });
    expect(result.durationBasis).toBe('bounded_by_next_entry');
    expect(result.windowStart).toBe('13:00');
    expect(result.windowEnd).toBe('15:30');
    expect(result.impactDurationHours).toBe(2.5);
    expect(result.eventFinishDate).not.toBeNull();
  });

  it('derives impactDurationHours from the window span, ignoring a mismatched model-reported value', () => {
    const result = resolveDurationProvenance({
      rawBasis: 'bounded_by_next_entry',
      rawWindowStart: '13:00',
      rawWindowEnd: '15:30',
      rawImpactDurationHours: 100, // model disagreement — the window must win, not this
      eventStartDate,
    });
    expect(result.durationBasis).toBe('bounded_by_next_entry');
    expect(result.impactDurationHours).toBe(2.5);
  });

  it('derives impactDurationHours from the window span even when the model omitted a number', () => {
    const result = resolveDurationProvenance({
      rawBasis: 'bounded_by_next_entry',
      rawWindowStart: '08:00',
      rawWindowEnd: '09:15',
      rawImpactDurationHours: null,
      eventStartDate,
    });
    expect(result.durationBasis).toBe('bounded_by_next_entry');
    expect(result.impactDurationHours).toBe(1.25);
  });

  it('clears the window and caps the duration when an over-cap bounded claim is rejected', () => {
    const result = resolveDurationProvenance({
      rawBasis: 'bounded_by_next_entry',
      rawWindowStart: '08:00',
      rawWindowEnd: '16:30',
      rawImpactDurationHours: 8.5,
      eventStartDate,
    });
    expect(result.durationBasis).toBe('estimated');
    expect(result.windowStart).toBeNull();
    expect(result.windowEnd).toBeNull();
    expect(result.impactDurationHours).toBe(MAX_BOUNDED_WINDOW_HOURS);
    expect(result.eventFinishDate).toBeNull();
    expect(result.rejectedBoundedClaimNote).toContain('08:00');
    expect(result.rejectedBoundedClaimNote).toContain('16:30');
    expect(result.rejectedBoundedClaimNote).toContain(`${MAX_BOUNDED_WINDOW_HOURS}h`);
  });

  it('clears the window when a bounded claim is rejected for an incomplete window', () => {
    const result = resolveDurationProvenance({
      rawBasis: 'bounded_by_next_entry',
      rawWindowStart: '13:00',
      rawWindowEnd: null,
      rawImpactDurationHours: 3,
      eventStartDate,
    });
    expect(result.durationBasis).toBe('estimated');
    expect(result.windowStart).toBeNull();
    expect(result.windowEnd).toBeNull();
    expect(result.impactDurationHours).toBe(3);
    expect(result.eventFinishDate).toBeNull();
    expect(result.rejectedBoundedClaimNote).toContain('incomplete');
  });

  it('explains a rejection caused by a non-increasing window', () => {
    const result = resolveDurationProvenance({
      rawBasis: 'bounded_by_next_entry',
      rawWindowStart: '15:30',
      rawWindowEnd: '13:00',
      rawImpactDurationHours: 3,
      eventStartDate,
    });
    expect(result.durationBasis).toBe('estimated');
    expect(result.rejectedBoundedClaimNote).toContain('did not increase');
  });

  it('does not cap a legitimately large document_stated or estimated duration', () => {
    const result = resolveDurationProvenance({
      rawBasis: 'estimated',
      rawWindowStart: null,
      rawWindowEnd: null,
      rawImpactDurationHours: 10,
      eventStartDate,
    });
    expect(result.durationBasis).toBe('estimated');
    expect(result.impactDurationHours).toBe(10);
    expect(result.rejectedBoundedClaimNote).toBeNull();
  });

  it('leaves a valid timestamp_derived claim untouched', () => {
    const result = resolveDurationProvenance({
      rawBasis: 'timestamp_derived',
      rawWindowStart: '07:00',
      rawWindowEnd: '08:30',
      rawImpactDurationHours: 1.5,
      eventStartDate,
    });
    expect(result.durationBasis).toBe('timestamp_derived');
    expect(result.windowStart).toBe('07:00');
    expect(result.windowEnd).toBe('08:30');
    expect(result.impactDurationHours).toBe(1.5);
    expect(result.eventFinishDate).not.toBeNull();
    expect(result.rejectedBoundedClaimNote).toBeNull();
  });

  it('does not set a rejection note for an accepted bounded claim', () => {
    const result = resolveDurationProvenance({
      rawBasis: 'bounded_by_next_entry',
      rawWindowStart: '13:00',
      rawWindowEnd: '15:30',
      rawImpactDurationHours: 2.5,
      eventStartDate,
    });
    expect(result.rejectedBoundedClaimNote).toBeNull();
  });
});
