import type { PodReport } from '../entities/PodReport';

/**
 * Narrow, read-only abstraction for obtaining POD evidence during delay-event analysis.
 *
 * This is the CQRS read side for POD data: it is deliberately separate from
 * IPodReportRepository (the write side used by upload/extraction) so analysis code can
 * depend on a small "give me evidence for these dates" contract without ever gaining
 * save/delete access to POD rows (ISP). It is the only thing the application layer is
 * allowed to know about POD during analysis.
 */
export interface IPodEvidenceProvider {
  /**
   * Returns every POD report whose reportDate falls within [startDate, endDate] (inclusive),
   * for the given project and tenant, keyed by calendar date ("YYYY-MM-DD" in UTC).
   *
   * Loads the whole range in one call so a batch analysis run can resolve POD evidence once
   * and reuse it for every document/event, rather than querying per delay event.
   */
  getEvidenceForDateRange(
    projectId: string,
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, PodReport[]>>;
}

/** Formats a Date as the "YYYY-MM-DD" key used by IPodEvidenceProvider's returned map. */
export function toPodEvidenceDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}
