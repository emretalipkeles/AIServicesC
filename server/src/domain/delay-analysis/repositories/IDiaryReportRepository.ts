import type { DiaryReport } from '../entities/DiaryReport';

/**
 * Narrow, tenant-scoped repository for diary reports. Mirrors IPodReportRepository: no
 * query/browse UI in this phase, so the only operations needed are a full replace for one
 * source document and a delete by source document (for document deletion).
 */
export interface IDiaryReportRepository {
  /**
   * Persists every dated report (and its entries) for one source document in a single
   * transaction. Only this source document's own existing rows are deleted first — other
   * documents' reports for the same date are left untouched, so overlapping uploads coexist.
   */
  saveReports(reports: DiaryReport[]): Promise<void>;

  /** Deletes all reports (and their entries via cascade) for a given source document. */
  deleteBySourceDocumentId(sourceDocumentId: string, tenantId: string): Promise<void>;
}
