/**
 * One-off backfill: re-parses an already-uploaded Foreman Diary PDF through the current
 * (page-marker-aware) parser and re-persists its dated entries, so existing diary reports
 * gain pageNumber/pageRangeEnd attribution that the original upload predates.
 *
 * This is NOT a general reprocessing feature (out of scope per task #47) — it is a targeted
 * one-time fix run directly against the specific document(s) whose original PDF bytes are
 * still available locally (project_documents.file_data is cleared after successful upload,
 * so this only works because the source file happens to still be on disk).
 *
 * Usage: npx tsx scripts/backfill-diary-pages.ts <documentId> <pathToOriginalPdf>
 */
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { db } from '../server/src/infrastructure/database';
import { projectDocuments } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { PdfDiaryDocumentParser } from '../server/src/infrastructure/document-parsing/PdfDiaryDocumentParser';
import { segmentDiaryText, isSegmentationReliable } from '../server/src/infrastructure/delay-analysis/diary/DiarySegmenter';
import { DiaryReport, type DiaryEntry } from '../server/src/domain/delay-analysis/entities/DiaryReport';
import { DrizzleDiaryReportRepository } from '../server/src/infrastructure/database/repositories/delay-analysis/DrizzleDiaryReportRepository';

function parseDateKeyAsUtc(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

async function main() {
  const [documentId, pdfPath] = process.argv.slice(2);
  if (!documentId || !pdfPath) {
    console.error('Usage: npx tsx scripts/backfill-diary-pages.ts <documentId> <pathToOriginalPdf>');
    process.exit(1);
  }

  const [doc] = await db.select().from(projectDocuments).where(eq(projectDocuments.id, documentId));
  if (!doc) {
    console.error(`No project_documents row found for id=${documentId}`);
    process.exit(1);
  }
  if (doc.documentType !== 'daily_report') {
    console.error(`Document ${documentId} is documentType=${doc.documentType}, not daily_report. Aborting.`);
    process.exit(1);
  }

  console.log(`Backfilling pages for document=${documentId} filename=${doc.filename} project=${doc.projectId} tenant=${doc.tenantId}`);

  const buffer = await readFile(pdfPath);
  const parser = new PdfDiaryDocumentParser();
  const parsed = await parser.parse(buffer, doc.filename);
  if (!parsed.rawContent) {
    console.error('Re-parse produced no content.');
    process.exit(1);
  }

  const segmentation = segmentDiaryText(parsed.rawContent);
  console.log(`Segmentation: datesFound=${segmentation.datesFound} entriesFound=${segmentation.entriesFound} unassigned=${segmentation.unassignedLineCount}/${segmentation.totalLineCount} reliable=${isSegmentationReliable(segmentation)}`);

  if (!isSegmentationReliable(segmentation) || segmentation.days.length === 0) {
    console.error('Deterministic segmentation unreliable or empty on re-parse; refusing to overwrite existing entries.');
    process.exit(1);
  }

  const withPages = segmentation.days.reduce((count, day) => count + day.entries.filter(e => e.pageNumber != null).length, 0);
  console.log(`Entries with page attribution: ${withPages} of ${segmentation.entriesFound}`);

  const reports = segmentation.days.map((day, index) => new DiaryReport({
    id: randomUUID(),
    sourceDocumentId: documentId,
    projectId: doc.projectId,
    tenantId: doc.tenantId,
    reportDate: parseDateKeyAsUtc(day.date),
    sequence: index,
    extractionMethod: 'deterministic',
    entries: day.entries as DiaryEntry[],
  }));

  const repo = new DrizzleDiaryReportRepository();
  await repo.saveReports(reports);

  const dates = reports.map(r => r.reportDate.toISOString().slice(0, 10)).sort();
  const summary = dates.length === 1
    ? `Split into 1 dated entry, ${dates[0]}`
    : `Split into ${dates.length} dated entries, ${dates[0]} to ${dates[dates.length - 1]}`;

  // Strip the NUL-prefixed page-marker lines before persisting rawContent: Postgres text
  // columns reject 0x00 bytes outright, and rawContent is only used downstream as prompt
  // context (which never needs the markers — those exist solely for the segmenter).
  const rawContentForStorage = parsed.rawContent
    .split('\n')
    .filter(line => !line.startsWith('\u0000PAGE:'))
    .join('\n');

  await db.update(projectDocuments)
    .set({ rawContent: rawContentForStorage, structuredExtractionSummary: summary, updatedAt: new Date() })
    .where(eq(projectDocuments.id, documentId));

  console.log(`Done: ${summary}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
