/**
 * Default duration ranges (in hours) the Field Memo extraction prompts fall back to when a
 * memo directs corrective action but states no explicit duration. These are prompt defaults —
 * heuristics for how long a typical corrective action of this kind takes — not extracted
 * findings. Keeping them here as a named, inspectable constant (instead of prose baked directly
 * into a prompt string) lets a reviewer tell "the model estimated this from a heuristic" apart
 * from "the model found this stated in the document", the same distinction duration provenance
 * tracking (see DurationProvenance.ts) makes for narrative-derived durations.
 */
export interface FieldMemoDurationDefault {
  readonly correctiveActionType: string;
  readonly minHours: number;
  readonly maxHours: number;
}

export const FIELD_MEMO_DURATION_DEFAULTS: ReadonlyArray<FieldMemoDurationDefault> = [
  { correctiveActionType: 'Fence relocation/modification', minHours: 4, maxHours: 8 },
  { correctiveActionType: 'Signage installation', minHours: 1, maxHours: 2 },
  { correctiveActionType: 'Clearance corrections (hydrant, sidewalk)', minHours: 2, maxHours: 4 },
  { correctiveActionType: 'Staging area security/setup', minHours: 4, maxHours: 8 },
  { correctiveActionType: 'Environmental cleanup (spill, hazardous waste)', minHours: 4, maxHours: 16 },
  { correctiveActionType: 'Stormwater BMP installation/repair', minHours: 2, maxHours: 8 },
  { correctiveActionType: 'Stockpile protection/covering', minHours: 1, maxHours: 4 },
  { correctiveActionType: 'Traffic control corrections', minHours: 2, maxHours: 4 },
  { correctiveActionType: 'General corrective actions (fallback minimum)', minHours: 2, maxHours: 4 },
];

/**
 * Renders FIELD_MEMO_DURATION_DEFAULTS as the bullet list the extraction prompts embed, so the
 * prompt text and the inspectable constant can never drift apart.
 */
export function renderFieldMemoDurationDefaultsPromptText(): string {
  return FIELD_MEMO_DURATION_DEFAULTS
    .map((entry) => `- ${entry.correctiveActionType}: ${entry.minHours}-${entry.maxHours} hours`)
    .join('\n');
}

export const FIELD_MEMO_DURATION_DEFAULTS_PROMPT_TEXT = renderFieldMemoDurationDefaultsPromptText();
