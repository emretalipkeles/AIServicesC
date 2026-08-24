import { describe, it, expect } from 'vitest';
import { AIDelayEventExtractorWithTools } from '../AIDelayEventExtractorWithTools';
import { AIResponseSchemaViolationError } from '../../../domain/errors/DomainError';
import type { IExtractionToolExecutor } from '../../../domain/delay-analysis/interfaces/IExtractionToolExecutor';
import type { IToolExtractionSystemPromptStrategyFactory } from '../../../domain/delay-analysis/interfaces/IToolExtractionSystemPromptStrategy';

/**
 * Guards the schema-enforcement contract from Task 52: response_format constrains the shape
 * the API accepts, but parseExtractionResponse is the last line of defense that must fail
 * loudly on a contract violation rather than silently returning an empty/partial event list
 * indistinguishable from a genuine "no delays found" result.
 */
describe('AIDelayEventExtractorWithTools.parseExtractionResponse', () => {
  const stubToolExecutor = {} as IExtractionToolExecutor;
  const stubPromptFactory = {} as IToolExtractionSystemPromptStrategyFactory;
  const extractor = new AIDelayEventExtractorWithTools(stubToolExecutor, stubPromptFactory, null);
  const parse = (response: string, documentType = 'idr') =>
    (extractor as any).parseExtractionResponse(response, 0.6, documentType, 'test-doc.pdf');

  it('parses a well-formed { delayEvents: [...] } response into events', () => {
    const result = parse(JSON.stringify({
      delayEvents: [{
        eventDescription: 'Crew idle waiting on material delivery',
        eventCategory: 'materials_equipment',
        eventDate: '2024-05-01',
        impactDurationHours: 2,
        durationBasis: 'estimated',
      }],
      workActivities: [],
    }));
    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventDescription).toContain('Crew idle');
  });

  it('strips a markdown fence as the one retained recovery step', () => {
    const fenced = '```json\n' + JSON.stringify({
      delayEvents: [{ eventDescription: 'Fenced event', durationBasis: 'estimated', impactDurationHours: 1 }],
    }) + '\n```';
    const result = parse(fenced);
    expect(result.events).toHaveLength(1);
  });

  it('throws AIResponseSchemaViolationError instead of returning [] when the response is not valid JSON', () => {
    expect(() => parse('The AI rambled instead of returning JSON.')).toThrow(AIResponseSchemaViolationError);
  });

  it('throws AIResponseSchemaViolationError when bounded_by_next_entry is missing fallbackEstimateHours', () => {
    const response = JSON.stringify({
      delayEvents: [{
        eventDescription: 'Slip-form machine broke',
        durationBasis: 'bounded_by_next_entry',
        impactDurationHours: 2.5,
        // fallbackEstimateHours intentionally omitted — this must fail loudly, not silently
        // fall back to a capped duration downstream.
      }],
    });
    expect(() => parse(response)).toThrow(AIResponseSchemaViolationError);
  });

  it('throws AIResponseSchemaViolationError for an unknown eventCategory rather than passing it through', () => {
    const response = JSON.stringify({
      delayEvents: [{
        eventDescription: 'Crew idle',
        eventCategory: 'not_a_real_category',
        durationBasis: 'estimated',
        impactDurationHours: 1,
      }],
    });
    expect(() => parse(response)).toThrow(AIResponseSchemaViolationError);
  });

  it('throws AIResponseSchemaViolationError for a malformed numeric string like "1junk"', () => {
    const response = JSON.stringify({
      delayEvents: [{
        eventDescription: 'Crew idle',
        durationBasis: 'estimated',
        impactDurationHours: '1junk',
      }],
    });
    expect(() => parse(response)).toThrow(AIResponseSchemaViolationError);
  });

  it('accepts bounded_by_next_entry once fallbackEstimateHours is a real number', () => {
    const response = JSON.stringify({
      delayEvents: [{
        eventDescription: 'Slip-form machine broke',
        durationBasis: 'bounded_by_next_entry',
        impactDurationHours: 2.5,
        fallbackEstimateHours: 1.5,
      }],
    });
    const result = parse(response);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].fallbackEstimateHours).toBe(1.5);
  });
});
