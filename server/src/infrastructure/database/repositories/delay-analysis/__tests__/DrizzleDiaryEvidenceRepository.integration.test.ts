import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../../../database';
import { delayAnalysisProjects, projectDocuments, diaryReports } from '@shared/schema';
import { DrizzleDiaryReportRepository } from '../DrizzleDiaryReportRepository';
import { DrizzleDiaryEvidenceRepository } from '../DrizzleDiaryEvidenceRepository';
import { DiaryReport } from '../../../../../domain/delay-analysis/entities/DiaryReport';
import { toDiaryEvidenceDateKey } from '../../../../../domain/delay-analysis/interfaces/IDiaryEvidenceProvider';

/**
 * Integration test against the real database, proving the read-side diary evidence
 * repository reconstructs the report/entry tree for a date range, merges overlapping
 * uploads for the same date, and enforces tenant isolation — modeled on
 * DrizzlePodEvidenceRepository's integration test.
 */
describe('DrizzleDiaryEvidenceRepository (integration)', () => {
  const writeRepository = new DrizzleDiaryReportRepository();
  const evidenceRepository = new DrizzleDiaryEvidenceRepository();
  const projectId = randomUUID();
  const sourceDocumentIdA = randomUUID();
  const sourceDocumentIdB = randomUUID();
  const tenantId = `test-tenant-${randomUUID()}`;
  const otherTenantId = `test-tenant-other-${randomUUID()}`;
  const reportDate = new Date('2021-09-23');

  afterAll(async () => {
    await db.delete(diaryReports).where(eq(diaryReports.sourceDocumentId, sourceDocumentIdA));
    await db.delete(diaryReports).where(eq(diaryReports.sourceDocumentId, sourceDocumentIdB));
    await db.delete(projectDocuments).where(eq(projectDocuments.id, sourceDocumentIdA));
    await db.delete(projectDocuments).where(eq(projectDocuments.id, sourceDocumentIdB));
    await db.delete(delayAnalysisProjects).where(eq(delayAnalysisProjects.id, projectId));
  });

  it('merges diary entries from overlapping uploads for the same date, scoped by project and tenant', async () => {
    await db.insert(delayAnalysisProjects).values({
      id: projectId,
      tenantId,
      name: 'Diary Evidence Integration Test Project',
      status: 'active',
    });
    await db.insert(projectDocuments).values([
      {
        id: sourceDocumentIdA,
        projectId,
        tenantId,
        filename: 'diary-a.pdf',
        contentType: 'application/pdf',
        documentType: 'daily_report',
        status: 'completed',
      },
      {
        id: sourceDocumentIdB,
        projectId,
        tenantId,
        filename: 'diary-b-overlapping.pdf',
        contentType: 'application/pdf',
        documentType: 'daily_report',
        status: 'completed',
      },
    ]);

    const reportA = new DiaryReport({
      id: randomUUID(),
      sourceDocumentId: sourceDocumentIdA,
      projectId,
      tenantId,
      reportDate,
      sequence: 0,
      extractionMethod: 'deterministic',
      entries: [
        { sequence: 0, authorName: 'J. Smith (jsmith)', weather: 'Clear, 72F', noteText: 'Crew on site at 7am.', pageNumber: 5, pageRangeEnd: null },
      ],
    });
    const reportB = new DiaryReport({
      id: randomUUID(),
      sourceDocumentId: sourceDocumentIdB,
      projectId,
      tenantId,
      reportDate,
      sequence: 0,
      extractionMethod: 'deterministic',
      entries: [
        { sequence: 0, authorName: 'R. Jones (rjones)', weather: null, noteText: 'Waiting on concrete delivery.', pageNumber: 8, pageRangeEnd: 9 },
      ],
    });

    await writeRepository.saveReports([reportA]);
    await writeRepository.saveReports([reportB]);

    const evidenceByDate = await evidenceRepository.getEvidenceForDateRange(
      projectId,
      tenantId,
      new Date('2021-09-01'),
      new Date('2021-09-30')
    );

    const dateKey = toDiaryEvidenceDateKey(reportDate);
    const reports = evidenceByDate.get(dateKey);
    expect(reports).toBeDefined();
    expect(reports).toHaveLength(2);

    const sourceIds = reports!.map(r => r.sourceDocumentId).sort();
    expect(sourceIds).toEqual([sourceDocumentIdA, sourceDocumentIdB].sort());

    const authors = reports!.flatMap(r => r.entries.map(e => e.authorName)).sort();
    expect(authors).toEqual(['J. Smith (jsmith)', 'R. Jones (rjones)']);

    // Outside the date range: nothing returned.
    const outOfRange = await evidenceRepository.getEvidenceForDateRange(
      projectId,
      tenantId,
      new Date('2021-01-01'),
      new Date('2021-01-31')
    );
    expect(outOfRange.size).toBe(0);

    // Wrong tenant: nothing returned even for the correct project and date range.
    const wrongTenant = await evidenceRepository.getEvidenceForDateRange(
      projectId,
      otherTenantId,
      new Date('2021-09-01'),
      new Date('2021-09-30')
    );
    expect(wrongTenant.size).toBe(0);
  });

  it('replacing one source document\'s reports does not touch another document\'s reports for the same date', async () => {
    // Re-save reportA with different content; reportB (from the other doc) must survive.
    const updatedReportA = new DiaryReport({
      id: randomUUID(),
      sourceDocumentId: sourceDocumentIdA,
      projectId,
      tenantId,
      reportDate,
      sequence: 0,
      extractionMethod: 'ai_fallback',
      entries: [
        { sequence: 0, authorName: 'J. Smith (jsmith)', weather: 'Overcast, 60F', noteText: 'Updated notes for the day.', pageNumber: 6, pageRangeEnd: null },
      ],
    });
    await writeRepository.saveReports([updatedReportA]);

    const evidenceByDate = await evidenceRepository.getEvidenceForDateRange(
      projectId,
      tenantId,
      new Date('2021-09-01'),
      new Date('2021-09-30')
    );
    const dateKey = toDiaryEvidenceDateKey(reportDate);
    const reports = evidenceByDate.get(dateKey)!;
    expect(reports).toHaveLength(2);

    const fromA = reports.find(r => r.sourceDocumentId === sourceDocumentIdA)!;
    expect(fromA.entries[0].noteText).toBe('Updated notes for the day.');
    expect(fromA.entries[0].pageNumber).toBe(6);
    expect(fromA.entries[0].pageRangeEnd).toBeNull();

    const fromB = reports.find(r => r.sourceDocumentId === sourceDocumentIdB)!;
    expect(fromB.entries[0].noteText).toBe('Waiting on concrete delivery.');
    expect(fromB.entries[0].pageNumber).toBe(8);
    expect(fromB.entries[0].pageRangeEnd).toBe(9);
  });
});
