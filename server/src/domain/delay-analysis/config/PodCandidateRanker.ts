import type { PodReport, PodSection, PodTaskLine } from '../entities/PodReport';
import type { ScheduleActivity } from '../entities/ScheduleActivity';
import { classifyPodSection } from './PodSectionClassifier';

// Pure ranking of candidate schedule activities against a single day's POD evidence. No I/O.
//
// The matcher truncates its candidate list to the first 100 activities before ever showing it
// to the model, so a correct activity described only deep in a long schedule can be cut off
// before the model sees it. Reordering POD-corroborated activities to the front (stable sort,
// ties broken by original order) fixes that without changing which activities are eligible.
//
// Only on-project (non-excluded) sections contribute positive evidence — per the "excluded
// sections are never positive evidence" rule, an @L200/OFF section's cost codes and keywords
// are never used to boost an activity's rank.

export interface PodCorroboration {
  section: PodSection;
  taskLine: PodTaskLine | null;
  costCode: string | null;
  matchedKeyword: string | null;
  /**
   * The specific POD report whose task line corroborated the activity. Callers must attribute
   * provenance to this exact report — never to an arbitrary "first" report — since a project day
   * can have multiple POD reports and only one may have actually supplied the evidence.
   */
  report: PodReport;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'work', 'area', 'near', 'along',
  'between', 'station', 'sta', 'crew', 'phase', 'install', 'installation',
]);

function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(word => word.length >= 4 && !STOPWORDS.has(word))
  );
}

function normalizeCostCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

function activityContainsCostCode(activity: ScheduleActivity, code: string): boolean {
  const normalizedCode = normalizeCostCode(code);
  if (normalizedCode.length === 0) return false;
  const haystacks = [activity.activityId, activity.wbs ?? '', activity.activityDescription]
    .map(text => normalizeCostCode(text));
  return haystacks.some(haystack => haystack.includes(normalizedCode));
}

/** Collects the on-project task lines (with their owning section) across a day's POD reports. */
function collectOnProjectTaskLines(podReports: PodReport[]): Array<{ section: PodSection; taskLine: PodTaskLine; report: PodReport }> {
  const result: Array<{ section: PodSection; taskLine: PodTaskLine; report: PodReport }> = [];
  for (const report of podReports) {
    for (const section of report.sections) {
      if (classifyPodSection(section).isExcluded) continue;
      for (const taskLine of section.taskLines) {
        result.push({ section, taskLine, report });
      }
    }
  }
  return result;
}

/**
 * Finds the first on-project POD task line that corroborates an activity by cost code or by
 * keyword overlap with the activity description, or null if the POD does not corroborate it.
 */
export function findPodCorroboration(activity: ScheduleActivity, podReports: PodReport[]): PodCorroboration | null {
  const onProjectLines = collectOnProjectTaskLines(podReports);
  const activityKeywords = extractKeywords(activity.activityDescription);

  for (const { section, taskLine, report } of onProjectLines) {
    if (taskLine.costCode && activityContainsCostCode(activity, taskLine.costCode)) {
      return { section, taskLine, costCode: taskLine.costCode, matchedKeyword: null, report };
    }
  }

  for (const { section, taskLine, report } of onProjectLines) {
    const lineKeywords = extractKeywords(taskLine.description);
    for (const keyword of Array.from(lineKeywords)) {
      if (activityKeywords.has(keyword)) {
        return { section, taskLine, costCode: taskLine.costCode ?? null, matchedKeyword: keyword, report };
      }
    }
  }

  return null;
}

/**
 * Reorders activities so POD-corroborated candidates come first (cost-code corroboration
 * ranked above keyword-only corroboration), preserving relative order within each group.
 */
export function rankActivitiesByPodEvidence(
  activities: ScheduleActivity[],
  podReports: PodReport[]
): ScheduleActivity[] {
  if (podReports.length === 0 || activities.length === 0) {
    return activities;
  }

  const onProjectLines = collectOnProjectTaskLines(podReports);
  if (onProjectLines.length === 0) {
    return activities;
  }

  const scored = activities.map((activity, index) => {
    const corroboration = findPodCorroboration(activity, podReports);
    let score = 0;
    if (corroboration?.costCode) score = 2;
    else if (corroboration?.matchedKeyword) score = 1;
    return { activity, index, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });

  return scored.map(entry => entry.activity);
}
