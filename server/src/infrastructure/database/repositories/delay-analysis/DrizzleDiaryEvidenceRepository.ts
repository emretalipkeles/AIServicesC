import { and, eq, gte, lte, inArray } from 'drizzle-orm';
import type { IDiaryEvidenceProvider } from '../../../../domain/delay-analysis/interfaces/IDiaryEvidenceProvider';
import { toDiaryEvidenceDateKey } from '../../../../domain/delay-analysis/interfaces/IDiaryEvidenceProvider';
import { DiaryReport, type DiaryExtractionMethod } from '../../../../domain/delay-analysis/entities/DiaryReport';
import { diaryReports, diaryEntries } from '@shared/schema';
import { db } from '../../../database';

/**
 * Read-side diary repository for delay analysis. Mirrors DrizzlePodEvidenceRepository:
 * loads a whole date range in one call, and merges reports from multiple source documents
 * for the same date into one list under that date's key.
 */
export class DrizzleDiaryEvidenceRepository implements IDiaryEvidenceProvider {
  async getEvidenceForDateRange(
    projectId: string,
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, DiaryReport[]>> {
    const reportRows = await db
      .select()
      .from(diaryReports)
      .where(and(
        eq(diaryReports.projectId, projectId),
        eq(diaryReports.tenantId, tenantId),
        gte(diaryReports.reportDate, startDate),
        lte(diaryReports.reportDate, endDate)
      ));

    const result = new Map<string, DiaryReport[]>();
    if (reportRows.length === 0) {
      return result;
    }

    const reportIds = reportRows.map(row => row.id);
    const entryRows = await db.select().from(diaryEntries).where(inArray(diaryEntries.reportId, reportIds));

    const entriesByReportId = new Map<string, typeof entryRows>();
    for (const entry of entryRows) {
      const list = entriesByReportId.get(entry.reportId) ?? [];
      list.push(entry);
      entriesByReportId.set(entry.reportId, list);
    }

    for (const reportRow of reportRows) {
      const entries = (entriesByReportId.get(reportRow.id) ?? [])
        .slice()
        .sort((a, b) => a.sequence - b.sequence)
        .map(row => ({
          sequence: row.sequence,
          authorName: row.authorName,
          weather: row.weather,
          noteText: row.noteText,
          pageNumber: row.pageNumber,
          pageRangeEnd: row.pageRangeEnd,
        }));

      const diaryReport = new DiaryReport({
        id: reportRow.id,
        sourceDocumentId: reportRow.sourceDocumentId,
        projectId: reportRow.projectId,
        tenantId: reportRow.tenantId,
        reportDate: reportRow.reportDate,
        sequence: reportRow.sequence,
        extractionMethod: reportRow.extractionMethod as DiaryExtractionMethod,
        entries,
      });

      const dateKey = toDiaryEvidenceDateKey(reportRow.reportDate);
      const list = result.get(dateKey) ?? [];
      list.push(diaryReport);
      result.set(dateKey, list);
    }

    return result;
  }
}
