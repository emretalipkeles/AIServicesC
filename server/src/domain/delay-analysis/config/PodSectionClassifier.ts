import type { PodSection } from '../entities/PodReport';

// Pure, dependency-free classification of a POD section as either genuine evidence of work
// on THIS project, or an exclusion that must never be used as positive matching evidence:
// - "other_project": the crew/equipment was sent to a different Sound Transit project that
//   day, marked with an "@L<number>" style reference (e.g. "@L200", "@L300").
// - "off": the crew was off / not working this project that day.
//
// Deliberately over-inclusive in what text it scans (label, crew, equipment, task lines,
// trucking/traffic/notes) because these markers are not modeled as their own column in the
// pod_* schema — they show up as ordinary text wherever the source sheet placed them.

export type PodSectionExclusionReason = 'other_project' | 'off';

export interface PodSectionClassification {
  isExcluded: boolean;
  exclusionReason: PodSectionExclusionReason | null;
  /** The literal text that triggered the exclusion, for traceability in prompts/reasoning. */
  exclusionEvidence: string | null;
}

const OTHER_PROJECT_MARKER_REGEX = /@\s*L\s*\d+/i;
const OFF_MARKER_REGEX = /^OFF$/i;

function collectSectionText(section: PodSection): string[] {
  const texts: string[] = [section.label];
  if (section.crewNumber) texts.push(section.crewNumber);
  if (section.category) texts.push(section.category);
  if (section.trucking) texts.push(section.trucking);
  if (section.traffic) texts.push(section.traffic);
  if (section.notes) texts.push(section.notes);
  for (const member of section.crewMembers) texts.push(member.name);
  for (const item of section.equipment) texts.push(item.name);
  for (const line of section.taskLines) {
    texts.push(line.description);
    if (line.costCode) texts.push(line.costCode);
  }
  return texts;
}

/**
 * Classifies a single POD section as on-project evidence or an exclusion. Sections are never
 * discarded — callers keep excluded sections around (flagged) so prompts can explicitly state
 * "these resources were not on this project that day" rather than silently dropping them.
 */
export function classifyPodSection(section: PodSection): PodSectionClassification {
  for (const text of collectSectionText(section)) {
    const match = text.match(OTHER_PROJECT_MARKER_REGEX);
    if (match) {
      return { isExcluded: true, exclusionReason: 'other_project', exclusionEvidence: match[0].trim() };
    }
  }

  const nonOffTaskLines = section.taskLines.filter(line => !OFF_MARKER_REGEX.test(line.description.trim()));
  const hasOffTaskLine = section.taskLines.some(line => OFF_MARKER_REGEX.test(line.description.trim()));
  const hasOffElsewhere = [section.trucking, section.traffic, section.notes].some(
    value => value != null && OFF_MARKER_REGEX.test(value.trim())
  );

  if (hasOffElsewhere || (hasOffTaskLine && nonOffTaskLines.length === 0)) {
    return { isExcluded: true, exclusionReason: 'off', exclusionEvidence: 'OFF' };
  }

  return { isExcluded: false, exclusionReason: null, exclusionEvidence: null };
}
