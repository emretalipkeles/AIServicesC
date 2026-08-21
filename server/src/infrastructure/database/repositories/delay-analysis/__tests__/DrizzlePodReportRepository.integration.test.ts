import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../../../database';
import { delayAnalysisProjects, projectDocuments, podReports, podSections } from '@shared/schema';
import { DrizzlePodReportRepository } from '../DrizzlePodReportRepository';
import { PodReport } from '../../../../../domain/delay-analysis/entities/PodReport';

/**
 * Integration test against the real database connection, proving the transactional
 * replace-on-reprocess behavior and tenant scoping required for the POD repository.
 * Cleans up all rows it creates.
 */
describe('DrizzlePodReportRepository (integration)', () => {
  const repository = new DrizzlePodReportRepository();
  const projectId = randomUUID();
  const sourceDocumentId = randomUUID();
  const tenantId = `test-tenant-${randomUUID()}`;
  const otherTenantId = `test-tenant-other-${randomUUID()}`;

  afterAll(async () => {
    await db.delete(projectDocuments).where(eq(projectDocuments.id, sourceDocumentId));
    await db.delete(delayAnalysisProjects).where(eq(delayAnalysisProjects.id, projectId));
  });

  it('replaces a report tree on re-save without duplicating rows, and stays tenant-scoped', async () => {
    await db.insert(delayAnalysisProjects).values({
      id: projectId,
      tenantId,
      name: 'POD Integration Test Project',
      status: 'active',
    });
    await db.insert(projectDocuments).values({
      id: sourceDocumentId,
      projectId,
      tenantId,
      filename: 'pod-integration-test.pdf',
      contentType: 'application/pdf',
      documentType: 'pod',
      status: 'completed',
    });

    const firstReport = new PodReport({
      id: randomUUID(),
      sourceDocumentId,
      projectId,
      tenantId,
      reportDate: new Date('2022-09-03'),
      title: 'Play of the Day',
      sections: [
        {
          sequence: 1,
          crewNumber: '211',
          label: 'CIVIL #1',
          category: 'civil',
          trucking: 'SEE TRUCKING DISPATCH',
          traffic: null,
          notes: null,
          crewMembers: [{ sequence: 1, name: 'J. BRICKMAN', workerId: null }],
          equipment: [{ sequence: 1, name: 'JD85 EXC 30-9978', isRental: true }],
          taskLines: [{ sequence: 1, description: '12" TIE-IN', costCode: '164.01' }],
        },
        {
          sequence: 2,
          crewNumber: null,
          label: 'SUBCONTRACTORS',
          category: null,
          trucking: null,
          traffic: null,
          notes: null,
          crewMembers: [],
          equipment: [],
          taskLines: [],
        },
      ],
    });

    await repository.saveReport(firstReport);

    const afterFirstSave = await db.select().from(podReports).where(eq(podReports.sourceDocumentId, sourceDocumentId));
    expect(afterFirstSave).toHaveLength(1);
    const afterFirstSections = await db.select().from(podSections).where(eq(podSections.reportId, afterFirstSave[0].id));
    expect(afterFirstSections).toHaveLength(2);

    // Re-save (simulating delete-then-reupload): a different report id, fewer sections.
    const secondReport = new PodReport({
      id: randomUUID(),
      sourceDocumentId,
      projectId,
      tenantId,
      reportDate: new Date('2022-09-03'),
      title: 'Play of the Day (reprocessed)',
      sections: [
        {
          sequence: 1,
          crewNumber: null,
          label: 'UPO',
          category: null,
          trucking: null,
          traffic: null,
          notes: null,
          crewMembers: [],
          equipment: [],
          taskLines: [{ sequence: 1, description: '1 UPO @ 19TH/MAD W/STEVE', costCode: null }],
        },
      ],
    });

    await repository.saveReport(secondReport);

    const afterSecondSave = await db.select().from(podReports).where(eq(podReports.sourceDocumentId, sourceDocumentId));
    // Exactly one report row for this source document - no duplicates accumulated.
    expect(afterSecondSave).toHaveLength(1);
    expect(afterSecondSave[0].id).toBe(secondReport.id);
    expect(afterSecondSave[0].title).toBe('Play of the Day (reprocessed)');

    const afterSecondSections = await db.select().from(podSections).where(eq(podSections.reportId, secondReport.id));
    expect(afterSecondSections).toHaveLength(1);
    expect(afterSecondSections[0].label).toBe('UPO');

    // The original section rows (belonging to the deleted report) must be gone via cascade.
    const orphanSections = await db.select().from(podSections).where(eq(podSections.reportId, firstReport.id));
    expect(orphanSections).toHaveLength(0);

    // deleteBySourceDocumentId is tenant-scoped: deleting under the wrong tenant must not
    // remove the report.
    await repository.deleteBySourceDocumentId(sourceDocumentId, otherTenantId);
    const stillThere = await db.select().from(podReports).where(eq(podReports.sourceDocumentId, sourceDocumentId));
    expect(stillThere).toHaveLength(1);

    // Deleting under the correct tenant removes it.
    await repository.deleteBySourceDocumentId(sourceDocumentId, tenantId);
    const afterDelete = await db.select().from(podReports).where(eq(podReports.sourceDocumentId, sourceDocumentId));
    expect(afterDelete).toHaveLength(0);
  });
});
