import { z } from 'zod';
import type { PodCrewMember, PodEquipmentItem, PodSection, PodTaskLine } from '../../../domain/delay-analysis/entities/PodReport';

/**
 * Validates and defensively coerces the raw AI JSON response for POD extraction into the
 * domain shape. Pure logic — no database or network access — so it stays independently
 * unit-testable per the input-validation-at-the-boundary rule: the model's output is
 * untrusted input and must be checked before anything reaches the repository.
 */

const rawEquipmentSchema = z.union([
  z.string(),
  z.object({
    name: z.string().optional().nullable(),
    isRental: z.boolean().optional(),
    is_rental: z.boolean().optional(),
  }).passthrough(),
]);

const rawTaskLineSchema = z.union([
  z.string(),
  z.object({
    description: z.string().optional().nullable(),
    text: z.string().optional().nullable(),
    task_text: z.string().optional().nullable(),
    costCode: z.string().optional().nullable(),
    cost_code: z.string().optional().nullable(),
  }).passthrough(),
]);

const rawSectionSchema = z.object({
  sequence: z.union([z.number(), z.string()]).optional(),
  sequence_number: z.union([z.number(), z.string()]).optional(),
  crewNumber: z.string().optional().nullable(),
  crew_number: z.string().optional().nullable(),
  label: z.string().optional().nullable(),
  section_label: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  section_category: z.string().optional().nullable(),
  crewMembers: z.array(z.string()).optional().nullable(),
  crew_members: z.array(z.string()).optional().nullable(),
  equipment: z.array(rawEquipmentSchema).optional().nullable(),
  taskLines: z.array(rawTaskLineSchema).optional().nullable(),
  task_lines: z.array(rawTaskLineSchema).optional().nullable(),
  trucking: z.string().optional().nullable(),
  trucking_note: z.string().optional().nullable(),
  traffic: z.string().optional().nullable(),
  traffic_note: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  other_notes: z.string().optional().nullable(),
}).passthrough();

const rawResponseSchema = z.object({
  reportDate: z.string().optional().nullable(),
  report_date: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  report_title: z.string().optional().nullable(),
  sections: z.array(rawSectionSchema).optional().nullable(),
}).passthrough();

export interface CoercedPodExtraction {
  reportDate: Date | null;
  title: string | null;
  sections: PodSection[];
}

/** Strips wrapping asterisks (e.g. "*JD85 EXC*") and reports whether they were present. */
function stripRentalAsterisks(raw: string): { name: string; isRental: boolean } {
  const trimmed = raw.trim();
  const asteriskMatch = trimmed.match(/^\*+(.*?)\*+$/);
  if (asteriskMatch) {
    return { name: asteriskMatch[1].trim(), isRental: true };
  }
  return { name: trimmed, isRental: false };
}

function coerceCrewMembers(raw: unknown): PodCrewMember[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(name => name.length > 0)
    .map((name, index) => ({ sequence: index + 1, name, workerId: null }));
}

function coerceEquipment(raw: unknown): PodEquipmentItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const items: PodEquipmentItem[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed.length === 0) continue;
      const { name, isRental } = stripRentalAsterisks(trimmed);
      if (name.length === 0) continue;
      items.push({ sequence: items.length + 1, name, isRental });
      continue;
    }
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const rawName = obj.name ?? obj.equipment_name;
      if (typeof rawName !== 'string' || rawName.trim().length === 0) continue;
      const { name, isRental: strippedRental } = stripRentalAsterisks(rawName);
      const flaggedRental = obj.isRental === true || obj.is_rental === true;
      items.push({ sequence: items.length + 1, name, isRental: strippedRental || flaggedRental });
    }
  }
  return items;
}

function coerceTaskLines(raw: unknown): PodTaskLine[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const lines: PodTaskLine[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed.length === 0) continue;
      lines.push({ sequence: lines.length + 1, description: trimmed, costCode: null });
      continue;
    }
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const rawDescription = obj.description ?? obj.text ?? obj.task_text;
      if (typeof rawDescription !== 'string' || rawDescription.trim().length === 0) continue;
      const rawCostCode = obj.costCode ?? obj.cost_code;
      lines.push({
        sequence: lines.length + 1,
        description: rawDescription.trim(),
        costCode: typeof rawCostCode === 'string' && rawCostCode.trim().length > 0 ? rawCostCode.trim() : null,
      });
    }
  }
  return lines;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Loosely parses a report date string; returns null (never throws) when it cannot be determined. */
function coerceReportDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Validates and coerces the raw parsed-JSON AI response. Returns null only when the response
 * has no usable shape at all (e.g. not an object); otherwise defensively fills in every
 * missing piece so a partial or malformed response still produces a valid, insertable tree.
 */
export function coercePodExtractionResponse(raw: unknown): CoercedPodExtraction | null {
  const result = rawResponseSchema.safeParse(raw);
  if (!result.success) {
    return null;
  }

  const data = result.data;
  const reportDate = coerceReportDate(data.reportDate ?? data.report_date);
  const title = nonEmptyString(data.title ?? data.report_title);

  const rawSections = data.sections ?? [];
  const sections: PodSection[] = [];

  rawSections.forEach((rawSection, index) => {
    const label = nonEmptyString(rawSection.label ?? rawSection.section_label);
    // A section missing a label is skipped rather than allowed to violate the NOT NULL
    // label constraint — every other field on an unrecognized/malformed section is defensive.
    if (!label) {
      return;
    }

    const sequenceCandidate = rawSection.sequence ?? rawSection.sequence_number;
    const sequence = typeof sequenceCandidate === 'number' && Number.isFinite(sequenceCandidate)
      ? sequenceCandidate
      : sections.length + 1;

    sections.push({
      sequence,
      crewNumber: nonEmptyString(rawSection.crewNumber ?? rawSection.crew_number),
      label,
      // Category has no enum: an unseen/empty category is always safe to insert.
      category: nonEmptyString(rawSection.category ?? rawSection.section_category),
      trucking: nonEmptyString(rawSection.trucking ?? rawSection.trucking_note),
      traffic: nonEmptyString(rawSection.traffic ?? rawSection.traffic_note),
      notes: nonEmptyString(rawSection.notes ?? rawSection.other_notes),
      crewMembers: coerceCrewMembers(rawSection.crewMembers ?? rawSection.crew_members),
      equipment: coerceEquipment(rawSection.equipment),
      taskLines: coerceTaskLines(rawSection.taskLines ?? rawSection.task_lines),
    });
  });

  return { reportDate, title, sections };
}
