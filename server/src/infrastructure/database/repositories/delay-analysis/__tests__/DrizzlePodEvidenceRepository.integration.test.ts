import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../../../database';
import { delayAnalysisProjects, projectDocuments, podReports } from '@shared/schema';
import { DrizzlePodReportRepository } from '../DrizzlePodReportRepository';
import { DrizzlePodEvidenceRepository } from '../DrizzlePodEvidenceRepository';
import { PodReport } from '../../../../../domain/delay-analysis/entities/PodReport';
import { toPodEvidenceDateKey } from '../../../../../domain/delay-analysis/interfaces/IPodEvidenceProvider';

/**
 * Integration test against the real database, proving the read-side POD evidence repository
 * reconstructs the full report/section/crew/equipment/task-line tree for a date range and
 * enforces tenant isolation, modeled on DrizzlePodReportRepository's integration test.
 */
describe('DrizzlePodEvidenceRepository (integration)', () => {
  const writeRepository = new DrizzlePodReportRepository();
  const evidenceRepository = new DrizzlePodEvidenceRepository();
  const projectId = randomUUID();
  const sourceDocumentId = randomUUID();
  const tenantId = `test-tenant-${randomUUID()}`;
  const otherTenantId = `test-tenant-other-${randomUUID()}`;
  const reportDate = new Date('2024-06-10');

  afterAll(async () => {
    await db.delete(podReports).where(eq(podReports.sourceDocumentId, sourceDocumentId));
    await db.delete(projectDocuments).where(eq(projectDocuments.id, sourceDocumentId));
    await db.delete(delayAnalysisProjects).where(eq(delayAnalysisProjects.id, projectId));
  });

  it('loads the full report tree for a date range, scoped by project and tenant', async () => {
    await db.insert(delayAnalysisProjects).values({
      id: projectId,
      tenantId,
      name: 'POD Evidence Integration Test Project',
      status: 'active',
    });
    await db.insert(projectDocuments).values({
      id: sourceDocumentId,
      projectId,
      tenantId,
      filename: 'pod-evidence-integration-test.pdf',
      contentType: 'application/pdf',
      documentType: 'pod',
      status: 'completed',
    });

    const report = new PodReport({
      id: randomUUID(),
      sourceDocumentId,
      projectId,
      tenantId,
      reportDate,
      title: 'Play of the Day',
      sections: [
        {
          sequence: 1,
          crewNumber: '211',
          label: 'CIVIL #1',
          category: 'civil',
          trucking: 'See dispatch',
          traffic: null,
          notes: null,
          crewMembers: [{ sequence: 1, name: 'J. Brickman', workerId: null }],
          equipment: [{ sequence: 1, name: 'JD85 EXC', isRental: true }],
          taskLines: [{ sequence: 1, description: '12" TIE-IN', costCode: '164.01' }],
        },
      ],
    });
    await writeRepository.saveReport(report);

    const evidenceByDate = await evidenceRepository.getEvidenceForDateRange(
      projectId,
      tenantId,
      new Date('2024-06-01'),
      new Date('2024-06-30')
    );

    const dateKey = toPodEvidenceDateKey(reportDate);
    const reports = evidenceByDate.get(dateKey);
    expect(reports).toBeDefined();
    expect(reports).toHaveLength(1);
    expect(reports![0].sections).toHaveLength(1);
    const section = reports![0].sections[0];
    expect(section.crewNumber).toBe('211');
    expect(section.crewMembers).toHaveLength(1);
    expect(section.crewMembers[0].name).toBe('J. Brickman');
    expect(section.equipment).toHaveLength(1);
    expect(section.equipment[0].name).toBe('JD85 EXC');
    expect(section.taskLines).toHaveLength(1);
    expect(section.taskLines[0].costCode).toBe('164.01');

    // Outside the date range: nothing returned.
    const outOfRange = await evidenceRepository.getEvidenceForDateRange(
      projectId,
      tenantId,
      new Date('2024-01-01'),
      new Date('2024-01-31')
    );
    expect(outOfRange.size).toBe(0);

    // Wrong tenant: nothing returned even for the correct project and date range.
    const wrongTenant = await evidenceRepository.getEvidenceForDateRange(
      projectId,
      otherTenantId,
      new Date('2024-06-01'),
      new Date('2024-06-30')
    );
    expect(wrongTenant.size).toBe(0);
  });
});
