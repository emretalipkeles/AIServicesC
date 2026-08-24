import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import type { IDiaryReportRepository } from '../../../../domain/delay-analysis/repositories/IDiaryReportRepository';
import type { DiaryReport } from '../../../../domain/delay-analysis/entities/DiaryReport';
import { diaryReports, diaryEntries } from '@shared/schema';
import { db } from '../../../database';

export class DrizzleDiaryReportRepository implements IDiaryReportRepository {
  async saveReports(reports: DiaryReport[]): Promise<void> {
    if (reports.length === 0) return;

    // All reports passed in a single call are expected to share one source document (one
    // parsed upload); guard against silently scoping the replace-delete to the wrong document.
    const sourceDocumentId = reports[0].sourceDocumentId;
    const tenantId = reports[0].tenantId;

    await db.transaction(async (tx) => {
      // Replace semantics scoped to this source document only: other documents' reports for
      // the same date are never touched, so overlapping uploads coexist (see IDiaryReportRepository).
      await tx.delete(diaryReports).where(and(
        eq(diaryReports.sourceDocumentId, sourceDocumentId),
        eq(diaryReports.tenantId, tenantId)
      ));

      for (const report of reports) {
        await tx.insert(diaryReports).values({
          id: report.id,
          sourceDocumentId: report.sourceDocumentId,
          projectId: report.projectId,
          tenantId: report.tenantId,
          reportDate: report.reportDate,
          sequence: report.sequence,
          extractionMethod: report.extractionMethod,
        });

        if (report.entries.length > 0) {
          await tx.insert(diaryEntries).values(
            report.entries.map(entry => ({
              id: randomUUID(),
              reportId: report.id,
              sequence: entry.sequence,
              authorName: entry.authorName,
              weather: entry.weather ?? null,
              noteText: entry.noteText,
              pageNumber: entry.pageNumber ?? null,
              pageRangeEnd: entry.pageRangeEnd ?? null,
            }))
          );
        }
      }
    });
  }

  async deleteBySourceDocumentId(sourceDocumentId: string, tenantId: string): Promise<void> {
    await db.delete(diaryReports).where(and(
      eq(diaryReports.sourceDocumentId, sourceDocumentId),
      eq(diaryReports.tenantId, tenantId)
    ));
  }
}
