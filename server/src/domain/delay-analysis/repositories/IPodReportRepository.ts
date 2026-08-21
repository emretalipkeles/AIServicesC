import type { PodReport } from '../entities/PodReport';

/**
 * Narrow, tenant-scoped repository for the POD report tree. Deliberately smaller than
 * IProjectDocumentRepository: POD data has no query/browse UI in this phase, so the only
 * operations needed are a full-tree replace and a delete by source document.
 */
export interface IPodReportRepository {
  /**
   * Persists the full report tree (report + sections + crew/equipment/task lines) in a
   * single transaction. Any existing report for the same source document is deleted first,
   * so re-processing a document replaces its structured rows rather than accumulating them.
   */
  saveReport(report: PodReport): Promise<void>;

  /** Deletes a report (and its sections/children via cascade) for a given source document. */
  deleteBySourceDocumentId(sourceDocumentId: string, tenantId: string): Promise<void>;
}
