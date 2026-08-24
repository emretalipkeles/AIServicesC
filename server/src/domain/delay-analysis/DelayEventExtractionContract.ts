import { z } from 'zod';
import type { DelayEventCategory, DurationBasis } from './entities/ContractorDelayEvent';

/**
 * Single source of truth for the delay-event extraction JSON contract that every
 * extraction prompt (four tool-extraction-prompts + four legacy extraction-strategies)
 * used to hand-restate independently, and that both parsers (AIDelayEventExtractorWithTools
 * and the legacy AIDelayEventExtractor) must accept identically.
 *
 * Three things are derived from this one module:
 * 1. `DELAY_EVENT_CATEGORIES` / `DURATION_BASIS_VALUES` — the enums, so a prompt can no
 *    longer type an incomplete or stale enum list (the drift the prompts had accumulated).
 * 2. `buildDelayExtractionJsonSchema()` — an OpenAI Structured Outputs (response_format:
 *    json_schema) schema, so the API itself rejects a malformed shape instead of the
 *    parser recovering with regex fence-stripping / brace-scanning.
 * 3. `delayExtractionResponseSchema` — a Zod schema used to validate the parsed response
 *    at runtime, including the one conditional business rule JSON Schema strict mode
 *    cannot express: fallbackEstimateHours must be a real number whenever durationBasis
 *    is 'bounded_by_next_entry'. A violation is a thrown error, not a silently degraded
 *    partial event (see AIResponseSchemaViolationError).
 * 4. `renderDelayEventOutputFormatBlock()` — the "## OUTPUT FORMAT" prose block every
 *    prompt embeds, parameterized only by the handful of fields each document type
 *    describes differently.
 */

export const DELAY_EVENT_CATEGORIES: readonly DelayEventCategory[] = [
  'planning_mobilization',
  'labor_related',
  'materials_equipment',
  'subcontractor_coordination',
  'quality_rework',
  'site_management_safety',
  'utility_infrastructure',
  'other',
] as const;

export const DURATION_BASIS_VALUES: readonly DurationBasis[] = [
  'timestamp_derived',
  'document_stated',
  'estimated',
  'bounded_by_next_entry',
] as const;

// ---------------------------------------------------------------------------------------
// Runtime validation (Zod). Untrusted AI output is checked at the boundary; a shape that
// fails this schema is a schema violation, not a "zero events" result.
// ---------------------------------------------------------------------------------------

const categoryEnum = z.enum(DELAY_EVENT_CATEGORIES as [DelayEventCategory, ...DelayEventCategory[]]);
const durationBasisEnum = z.enum(DURATION_BASIS_VALUES as [DurationBasis, ...DurationBasis[]]);

/**
 * Accepts a genuinely finite number, or a string that fully (not just partially, as
 * `parseFloat` would) parses as one. Rejects anything else — including "1junk" — as a
 * schema violation rather than silently coercing it to a plausible-looking number or null.
 */
const nullableFiniteNumber = z.union([z.number(), z.string()])
  .nullable()
  .optional()
  .superRefine((value, ctx) => {
    if (value === null || value === undefined) return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a finite number' });
      }
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0 || !Number.isFinite(Number(trimmed))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${value}" is not a valid number` });
    }
  })
  .transform((value) => {
    if (value === null || value === undefined) return null;
    return typeof value === 'number' ? value : Number(value.trim());
  });

export const rawDelayEventSchema = z.object({
  eventDescription: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  eventCategory: categoryEnum.optional().nullable(),
  category: categoryEnum.optional().nullable(),
  eventDate: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  impactDurationHours: nullableFiniteNumber,
  impactedWindowStart: z.string().optional().nullable(),
  impactedWindowEnd: z.string().optional().nullable(),
  durationBasis: durationBasisEnum.optional().nullable(),
  fallbackEstimateHours: nullableFiniteNumber,
  sourceReference: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  extractedFromCode: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  confidenceScore: nullableFiniteNumber,
  delayEventConfidence: nullableFiniteNumber,
  responsibilityConfirmed: z.boolean().optional().nullable(),
  reworkDescription: z.string().optional().nullable(),
  matchedActivityId: z.string().optional().nullable(),
  matchedActivityDescription: z.string().optional().nullable(),
  matchedActivityWbs: z.string().optional().nullable(),
  matchConfidence: nullableFiniteNumber,
  matchReasoning: z.string().optional().nullable(),
}).passthrough().superRefine((event, ctx) => {
  if (event.durationBasis === 'bounded_by_next_entry') {
    const value = event.fallbackEstimateHours;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fallbackEstimateHours'],
        message: "fallbackEstimateHours must be a finite number whenever durationBasis is 'bounded_by_next_entry'",
      });
    }
  }
});

export type RawExtractedDelayEvent = z.infer<typeof rawDelayEventSchema>;

const rawWorkActivitySchema = z.object({
  activityId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  comments: z.string().optional().nullable(),
}).passthrough();

/**
 * Accepts either the documented `{ delayEvents: [...] }` / `{ events: [...] }` shape or a
 * bare top-level array (the one recovery path retained as a genuine last resort — some
 * models still emit a bare array despite the system prompt and response_format schema).
 */
export const delayExtractionResponseSchema = z.union([
  z.object({
    delayEvents: z.array(rawDelayEventSchema).optional(),
    events: z.array(rawDelayEventSchema).optional(),
    workActivities: z.array(rawWorkActivitySchema).optional().nullable(),
  }).passthrough(),
  z.array(rawDelayEventSchema),
]);

export type DelayExtractionResponse = z.infer<typeof delayExtractionResponseSchema>;

/**
 * Normalizes either accepted shape into a flat list of raw events plus optional work
 * activities, so callers don't need to re-derive the delayEvents/events/bare-array cases.
 */
export function normalizeDelayExtractionResponse(parsed: DelayExtractionResponse): {
  rawEvents: RawExtractedDelayEvent[];
  rawWorkActivities: Array<z.infer<typeof rawWorkActivitySchema>>;
} {
  if (Array.isArray(parsed)) {
    return { rawEvents: parsed, rawWorkActivities: [] };
  }
  return {
    rawEvents: parsed.delayEvents ?? parsed.events ?? [],
    rawWorkActivities: parsed.workActivities ?? [],
  };
}

// ---------------------------------------------------------------------------------------
// OpenAI Structured Outputs (response_format: json_schema) schema.
// ---------------------------------------------------------------------------------------

const EVENT_FIELD_KEYS = [
  'eventDescription',
  'eventCategory',
  'eventDate',
  'impactDurationHours',
  'impactedWindowStart',
  'impactedWindowEnd',
  'durationBasis',
  'fallbackEstimateHours',
  'sourceReference',
  'extractedFromCode',
  'confidenceScore',
  'delayEventConfidence',
  'responsibilityConfirmed',
  'reworkDescription',
  'matchedActivityId',
  'matchedActivityDescription',
  'matchedActivityWbs',
  'matchConfidence',
  'matchReasoning',
] as const;

/**
 * Builds the strict-mode JSON Schema passed as `response_format.json_schema.schema`.
 * Strict mode requires every property to be listed in `required` (optionality is
 * expressed via a `["type", "null"]` union, not by omitting the key) and forbids
 * `additionalProperties`. It cannot express the fallbackEstimateHours-when-bounded
 * conditional — that is enforced separately by `rawDelayEventSchema`'s superRefine.
 */
export function buildDelayExtractionJsonSchema(): Record<string, unknown> {
  const eventProperties: Record<string, unknown> = {
    eventDescription: { type: 'string', description: 'Clear description of what caused the delay.' },
    eventCategory: { type: ['string', 'null'], enum: [...DELAY_EVENT_CATEGORIES, null] },
    eventDate: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    impactDurationHours: { type: ['number', 'null'] },
    impactedWindowStart: { type: ['string', 'null'], description: 'HH:MM clock time the impact began, only when known.' },
    impactedWindowEnd: { type: ['string', 'null'], description: 'HH:MM clock time the impact ended, only when known.' },
    durationBasis: { type: ['string', 'null'], enum: [...DURATION_BASIS_VALUES, null] },
    fallbackEstimateHours: {
      type: ['number', 'null'],
      description: "Independent duration estimate. Must be a real (non-null) number whenever durationBasis is 'bounded_by_next_entry'; null otherwise.",
    },
    sourceReference: { type: ['string', 'null'] },
    extractedFromCode: { type: ['string', 'null'] },
    confidenceScore: { type: ['number', 'null'] },
    delayEventConfidence: { type: ['number', 'null'] },
    responsibilityConfirmed: { type: ['boolean', 'null'] },
    reworkDescription: { type: ['string', 'null'] },
    matchedActivityId: { type: ['string', 'null'] },
    matchedActivityDescription: { type: ['string', 'null'] },
    matchedActivityWbs: { type: ['string', 'null'] },
    matchConfidence: { type: ['number', 'null'] },
    matchReasoning: { type: ['string', 'null'] },
  };

  const eventSchema = {
    type: 'object',
    properties: eventProperties,
    required: [...EVENT_FIELD_KEYS],
    additionalProperties: false,
  };

  const workActivitySchema = {
    type: 'object',
    properties: {
      activityId: { type: 'string' },
      description: { type: 'string' },
      comments: { type: ['string', 'null'] },
    },
    required: ['activityId', 'description', 'comments'],
    additionalProperties: false,
  };

  return {
    type: 'object',
    properties: {
      delayEvents: { type: 'array', items: eventSchema },
      workActivities: { type: 'array', items: workActivitySchema },
    },
    required: ['delayEvents', 'workActivities'],
    additionalProperties: false,
  };
}

// ---------------------------------------------------------------------------------------
// Shared prompt-documentation renderer.
// ---------------------------------------------------------------------------------------

export interface DelayEventFieldGuidance {
  eventDate?: string;
  impactDurationHours?: string;
  impactedWindowStart?: string;
  impactedWindowEnd?: string;
  durationBasis?: string;
  fallbackEstimateHours?: string;
  sourceReference?: string;
  extractedFromCode?: string;
  confidenceScore?: string;
  delayEventConfidence?: string;
  reworkDescription?: string;
}

const DEFAULT_GUIDANCE: Required<DelayEventFieldGuidance> = {
  eventDate: '"YYYY-MM-DD"',
  impactDurationHours: 'number or null',
  impactedWindowStart: '"HH:MM clock time the impact began, ONLY when the document gives a real time" or null',
  impactedWindowEnd: '"HH:MM clock time the impact ended, ONLY when the document gives a real time" or null',
  durationBasis: `one of: ${DURATION_BASIS_VALUES.join(', ')}, or null`,
  fallbackEstimateHours: "REQUIRED (a real number) whenever durationBasis is 'bounded_by_next_entry'; otherwise omit or null. Independent best-guess duration ignoring the bounded window, used as the fallback if the server rejects that window as implausible.",
  sourceReference: '"section/paragraph reference"',
  extractedFromCode: '"reference code if applicable"',
  confidenceScore: '0.0-1.0',
  delayEventConfidence: '0.0-1.0',
  reworkDescription: '"specific corrective action required, if applicable" or null',
};

/**
 * Renders the "## OUTPUT FORMAT" block embedded in every extraction prompt (tool-based and
 * legacy). The field list, key order, and enum values always come from this one module;
 * callers only override the handful of prose descriptions that legitimately differ by
 * document type (e.g. NCRs never estimate a duration).
 */
export function renderDelayEventOutputFormatBlock(
  guidance: DelayEventFieldGuidance = {},
  options: { workActivitiesExample?: string } = {}
): string {
  const g = { ...DEFAULT_GUIDANCE, ...guidance };
  const categoriesLine = `one of: ${DELAY_EVENT_CATEGORIES.join(', ')}`;
  const workActivitiesExample = options.workActivitiesExample ?? '[]';

  return `## OUTPUT FORMAT:
Return a JSON object with the structure:
{
  "delayEvents": [
    {
      "eventDescription": "Clear description of what caused the delay",
      "eventCategory": "${categoriesLine}",
      "eventDate": ${g.eventDate},
      "impactDurationHours": ${g.impactDurationHours},
      "impactedWindowStart": ${g.impactedWindowStart},
      "impactedWindowEnd": ${g.impactedWindowEnd},
      "durationBasis": "${g.durationBasis}",
      "fallbackEstimateHours": "${g.fallbackEstimateHours}",
      "sourceReference": ${g.sourceReference},
      "extractedFromCode": ${g.extractedFromCode},
      "confidenceScore": ${g.confidenceScore},
      "delayEventConfidence": ${g.delayEventConfidence},
      "responsibilityConfirmed": true/false,
      "reworkDescription": ${g.reworkDescription},
      "matchedActivityId": "activity ID if matched" or null,
      "matchedActivityDescription": "description of matched activity" or null,
      "matchedActivityWbs": "WBS code of matched activity" or null,
      "matchConfidence": 0.0-1.0 if matched or null,
      "matchReasoning": "why this activity matches" or null
    }
  ],
  "workActivities": ${workActivitiesExample}
}`;
}
