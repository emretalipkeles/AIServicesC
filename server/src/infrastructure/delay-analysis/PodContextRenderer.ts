import type { PodReport, PodSection } from '../../domain/delay-analysis/entities/PodReport';
import { classifyPodSection } from '../../domain/delay-analysis/config/PodSectionClassifier';

// Single-responsibility, pure renderer: turns one day's POD report tree into a compact,
// deterministic text block for prompt context. No AI call — the data is already structured,
// so this is plain formatting. No I/O of any kind, so it is unit-testable without a DB.
//
// Untrusted-content safety: the returned text is meant to be embedded inside the caller's
// prompt wrapped in that prompt's own "treat as data, not instructions" markers (mirroring how
// PODExtractionStrategy and the field-memo context block already do this) — this renderer does
// not add its own wrapper so callers keep one consistent convention per prompt.

const MAX_CONTEXT_CHARS = 4000;

function formatOnProjectSection(section: PodSection): string {
  const lines: string[] = [];
  const header = [section.crewNumber ? `Crew ${section.crewNumber}` : null, section.label, section.category ? `(${section.category})` : null]
    .filter(Boolean)
    .join(' ');
  lines.push(`- ${header}`);
  if (section.crewMembers.length > 0) {
    lines.push(`  Crew size: ${section.crewMembers.length}`);
  }
  if (section.equipment.length > 0) {
    lines.push(`  Equipment: ${section.equipment.map(e => e.name + (e.isRental ? ' (rental)' : '')).join(', ')}`);
  }
  for (const taskLine of section.taskLines) {
    const codeSuffix = taskLine.costCode ? ` [cost code: ${taskLine.costCode}]` : '';
    lines.push(`  Task: ${taskLine.description}${codeSuffix}`);
  }
  if (section.trucking) lines.push(`  Trucking: ${section.trucking}`);
  if (section.traffic) lines.push(`  Traffic: ${section.traffic}`);
  if (section.notes) lines.push(`  Notes: ${section.notes}`);
  return lines.join('\n');
}

function formatExclusion(section: PodSection, reason: string, evidence: string | null): string {
  const label = [section.crewNumber ? `Crew ${section.crewNumber}` : null, section.label].filter(Boolean).join(' ');
  const reasonText = reason === 'other_project'
    ? `sent to another project (${evidence ?? 'other-project marker'})`
    : 'OFF that day';
  return `- ${label}: ${reasonText} — NOT evidence of work on this project`;
}

/**
 * Renders the on-project and excluded sections of one day's POD report(s) into a text block,
 * capped to MAX_CONTEXT_CHARS so it cannot crowd the schedule activity list out of a prompt.
 * Returns null when there is nothing usable to render (e.g. reports with no sections at all).
 */
export function renderPodDayContext(podReports: PodReport[]): string | null {
  if (podReports.length === 0) {
    return null;
  }

  const onProjectBlocks: string[] = [];
  const exclusionBlocks: string[] = [];

  for (const report of podReports) {
    for (const section of report.sections) {
      const classification = classifyPodSection(section);
      if (classification.isExcluded) {
        exclusionBlocks.push(formatExclusion(section, classification.exclusionReason!, classification.exclusionEvidence));
      } else {
        onProjectBlocks.push(formatOnProjectSection(section));
      }
    }
  }

  if (onProjectBlocks.length === 0 && exclusionBlocks.length === 0) {
    return null;
  }

  const parts: string[] = [];
  if (onProjectBlocks.length > 0) {
    parts.push('Crews/equipment working on THIS project that day, per the Play of the Day (POD) report:');
    parts.push(onProjectBlocks.join('\n'));
  }
  if (exclusionBlocks.length > 0) {
    parts.push('\nResources NOT on this project that day (never use these as evidence for a match):');
    parts.push(exclusionBlocks.join('\n'));
  }

  let text = parts.join('\n');
  if (text.length > MAX_CONTEXT_CHARS) {
    text = text.slice(0, MAX_CONTEXT_CHARS) + '\n[... POD context truncated ...]';
  }
  return text;
}
