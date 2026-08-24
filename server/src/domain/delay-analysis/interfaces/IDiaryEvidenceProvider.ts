import type { DiaryReport } from '../entities/DiaryReport';

/**
 * Narrow, read-only abstraction for obtaining Foreman Diary evidence during delay-event
 * analysis. Mirrors IPodEvidenceProvider: the CQRS read side, kept separate from
 * IDiaryReportRepository (the write side used by upload/extraction) so analysis code
 * depends only on "give me evidence for these dates" (ISP).
 */
export interface IDiaryEvidenceProvider {
  /**
   * Returns every diary report whose reportDate falls within [startDate, endDate]
   * (inclusive), for the given project and tenant, keyed by calendar date ("YYYY-MM-DD" in
   * UTC). Reports from multiple source documents for the same date are merged into one list
   * under that date's key.
   *
   * Loads the whole range in one call so a batch analysis run can resolve diary evidence
   * once and reuse it for every document/event, rather than querying per delay event.
   */
  getEvidenceForDateRange(
    projectId: string,
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, DiaryReport[]>>;
}

/** Formats a Date as the "YYYY-MM-DD" key used by IDiaryEvidenceProvider's returned map. */
export function toDiaryEvidenceDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Diary evidence resolved for one document/event's effective date: the rendered prompt text
 * plus the underlying reports it was built from. Mirrors PodMatchEvidence's shape so
 * extraction-time audit metadata can be built the same way for both, even though diary
 * evidence (unlike POD) is never passed to the activity matcher.
 */
export interface DiaryMatchEvidence {
  contextText: string;
  reports: DiaryReport[];
}
