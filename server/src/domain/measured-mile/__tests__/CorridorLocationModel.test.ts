import { describe, it, expect } from 'vitest';
import { matchLocationText, activityMatchesItemDescription, DEFAULT_CORRIDOR_LOCATIONS } from '../CorridorLocationModel';

describe('matchLocationText', () => {
  it('resolves a single numbered-street token, deliberately ignoring "MADISON" as it is the corridor itself', () => {
    const result = matchLocationText('MADISON AND 13TH');
    expect(result).toEqual({ matchedKeys: ['13th'], matchType: 'single', confidence: 'high', rawText: 'MADISON AND 13TH' });
  });

  it('resolves a tight explicit range to a high-confidence span of every canonical station between the endpoints', () => {
    const result = matchLocationText('11TH TO 12TH SOUTH SIDE');
    expect(result?.matchType).toBe('range');
    expect(result?.matchedKeys).toEqual(['11th', '12th']);
    expect(result?.confidence).toBe('high');
  });

  it('resolves a named cross-street to numbered-street range, matching the STAGE 9 example verbatim', () => {
    const result = matchLocationText('STAGE 9 (DENNY TO 23RD)');
    expect(result?.matchType).toBe('range');
    expect(result?.matchedKeys).toEqual(['denny', '23rd']);
    expect(result?.confidence).toBe('high');
  });

  it('returns null when no corridor token is present', () => {
    expect(matchLocationText('MOBILIZATION AND TRAFFIC CONTROL')).toBeNull();
    expect(matchLocationText(null)).toBeNull();
    expect(matchLocationText('')).toBeNull();
  });

  it('does not confuse "111th" with "11th" due to word-boundary anchoring', () => {
    expect(matchLocationText('BLOCK 111TH SOMETHING')).toBeNull();
  });

  it('downgrades confidence for a wide, connector-less multi-token span', () => {
    const result = matchLocationText('1ST 5TH 9TH 15TH CORRIDOR REVIEW');
    expect(result?.matchType).toBe('range');
    expect(result?.confidence).toBe('low');
  });

  it('exposes an editable default ordering covering the full corridor', () => {
    expect(DEFAULT_CORRIDOR_LOCATIONS.length).toBeGreaterThan(20);
    const orders = DEFAULT_CORRIDOR_LOCATIONS.map((l) => l.defaultStationOrder);
    expect(new Set(orders).size).toBe(orders.length); // no duplicate station positions
  });
});

describe('activityMatchesItemDescription', () => {
  it('matches on a shared significant word', () => {
    expect(activityMatchesItemDescription('INSTALL STORM DRAIN PIPE 13TH', 'Storm Drainage Pipe, 12-inch')).toBe(true);
  });

  it('does not match on stopwords alone', () => {
    expect(activityMatchesItemDescription('SOUTH SIDE WORK', 'Side and With Work')).toBe(false);
  });

  it('returns false when the item description is missing', () => {
    expect(activityMatchesItemDescription('ANYTHING', null)).toBe(false);
  });
});
