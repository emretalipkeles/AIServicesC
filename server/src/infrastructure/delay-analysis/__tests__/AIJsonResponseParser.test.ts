import { describe, it, expect } from 'vitest';
import { extractJsonObjectFromResponse } from '../AIJsonResponseParser';

describe('extractJsonObjectFromResponse', () => {
  it('parses a plain JSON object with no fence', () => {
    const result = extractJsonObjectFromResponse('{"a": 1, "b": "two"}');
    expect(result).toEqual({ a: 1, b: 'two' });
  });

  it('strips a ```json code fence', () => {
    const response = '```json\n{"a": 1}\n```';
    expect(extractJsonObjectFromResponse(response)).toEqual({ a: 1 });
  });

  it('strips a bare ``` code fence', () => {
    const response = '```\n{"a": 1}\n```';
    expect(extractJsonObjectFromResponse(response)).toEqual({ a: 1 });
  });

  it('extracts the object even with leading/trailing prose', () => {
    const response = 'Here is the JSON you requested:\n{"a": 1}\nHope that helps!';
    expect(extractJsonObjectFromResponse(response)).toEqual({ a: 1 });
  });

  it('handles nested braces correctly', () => {
    const response = '{"a": {"b": {"c": 1}}}';
    expect(extractJsonObjectFromResponse(response)).toEqual({ a: { b: { c: 1 } } });
  });

  it('returns null for malformed JSON', () => {
    expect(extractJsonObjectFromResponse('{"a": 1,}')).toBeNull();
  });

  it('returns null when there is no object at all', () => {
    expect(extractJsonObjectFromResponse('no json here')).toBeNull();
  });

  it('returns null for a top-level array', () => {
    expect(extractJsonObjectFromResponse('[1, 2, 3]')).toBeNull();
  });
});
