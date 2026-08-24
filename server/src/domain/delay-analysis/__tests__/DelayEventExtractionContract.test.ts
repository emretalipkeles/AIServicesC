import { describe, it, expect } from 'vitest';
import {
  DELAY_EVENT_CATEGORIES,
  DURATION_BASIS_VALUES,
  delayExtractionResponseSchema,
  normalizeDelayExtractionResponse,
  buildDelayExtractionJsonSchema,
  renderDelayEventOutputFormatBlock,
} from '../DelayEventExtractionContract';

describe('DelayEventExtractionContract', () => {
  const validEvent = {
    eventDescription: 'Crew waited for redispatched concrete truck',
    eventCategory: 'materials_equipment',
    eventDate: '2024-05-01',
    impactDurationHours: 1.5,
    durationBasis: 'timestamp_derived',
  };

  it('accepts a well-formed { delayEvents: [...] } response', () => {
    const result = delayExtractionResponseSchema.safeParse({ delayEvents: [validEvent], workActivities: [] });
    expect(result.success).toBe(true);
  });

  it('accepts a bare top-level array as the one retained recovery path', () => {
    const result = delayExtractionResponseSchema.safeParse([validEvent]);
    expect(result.success).toBe(true);
    if (result.success) {
      const { rawEvents } = normalizeDelayExtractionResponse(result.data);
      expect(rawEvents).toHaveLength(1);
    }
  });

  it('rejects an event claiming bounded_by_next_entry without a numeric fallbackEstimateHours', () => {
    const result = delayExtractionResponseSchema.safeParse({
      delayEvents: [{
        ...validEvent,
        durationBasis: 'bounded_by_next_entry',
        fallbackEstimateHours: null,
      }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/fallbackEstimateHours/);
    }
  });

  it('rejects an unknown eventCategory instead of silently passing it through', () => {
    const result = delayExtractionResponseSchema.safeParse({
      delayEvents: [{ ...validEvent, eventCategory: 'not_a_real_category' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown durationBasis instead of silently passing it through', () => {
    const result = delayExtractionResponseSchema.safeParse({
      delayEvents: [{ ...validEvent, durationBasis: 'made_up_basis' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed numeric string ("1junk") for impactDurationHours', () => {
    const result = delayExtractionResponseSchema.safeParse({
      delayEvents: [{ ...validEvent, impactDurationHours: '1junk' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed fallbackEstimateHours even when durationBasis is bounded_by_next_entry', () => {
    const result = delayExtractionResponseSchema.safeParse({
      delayEvents: [{
        ...validEvent,
        durationBasis: 'bounded_by_next_entry',
        fallbackEstimateHours: '1junk',
      }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts bounded_by_next_entry when fallbackEstimateHours is a real number', () => {
    const result = delayExtractionResponseSchema.safeParse({
      delayEvents: [{
        ...validEvent,
        durationBasis: 'bounded_by_next_entry',
        fallbackEstimateHours: 0.75,
      }],
    });
    expect(result.success).toBe(true);
  });

  it('normalizes the { events: [...] } alias into the same shape as delayEvents', () => {
    const result = delayExtractionResponseSchema.safeParse({ events: [validEvent] });
    expect(result.success).toBe(true);
    if (result.success) {
      const { rawEvents } = normalizeDelayExtractionResponse(result.data);
      expect(rawEvents).toHaveLength(1);
    }
  });

  it('builds a strict JSON schema whose required list matches its own property list at every level', () => {
    const schema = buildDelayExtractionJsonSchema() as any;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required.sort()).toEqual(Object.keys(schema.properties).sort());

    const eventSchema = schema.properties.delayEvents.items;
    expect(eventSchema.additionalProperties).toBe(false);
    expect(eventSchema.required.sort()).toEqual(Object.keys(eventSchema.properties).sort());
    expect(eventSchema.properties.eventCategory.enum).toEqual([...DELAY_EVENT_CATEGORIES, null]);
    expect(eventSchema.properties.durationBasis.enum).toEqual([...DURATION_BASIS_VALUES, null]);

    const workActivitySchema = schema.properties.workActivities.items;
    expect(workActivitySchema.additionalProperties).toBe(false);
    expect(workActivitySchema.required.sort()).toEqual(Object.keys(workActivitySchema.properties).sort());
  });

  it('renders every canonical category and duration basis value into the output format block', () => {
    const block = renderDelayEventOutputFormatBlock();
    for (const category of DELAY_EVENT_CATEGORIES) {
      expect(block).toContain(category);
    }
    for (const basis of DURATION_BASIS_VALUES) {
      expect(block).toContain(basis);
    }
  });

  it('lets a caller override individual field guidance without losing the others', () => {
    const block = renderDelayEventOutputFormatBlock({ durationBasis: 'always estimated for this doc type' });
    expect(block).toContain('always estimated for this doc type');
    expect(block).toContain('"confidenceScore": 0.0-1.0');
  });
});
