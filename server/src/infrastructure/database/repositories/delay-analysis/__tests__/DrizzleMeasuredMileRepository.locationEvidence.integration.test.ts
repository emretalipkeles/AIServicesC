import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../../../database';
import { delayAnalysisProjects, scheduleActivities, contractorDelayEvents } from '@shared/schema';
import { DrizzleMeasuredMileRepository } from '../DrizzleMeasuredMileRepository';
import type { PeriodQuality } from '../../../../../domain/measured-mile/MeasuredMileCalculator';

const NO_FILTERS = { verifiedOnly: false };

/**
 * Integration test against the real database for the schedule-activity fallback evidence branch
 * of getLocationAllocationInputs -- no POD/cost-code crosswalk exists for this item, so every
 * candidate below comes from schedule_activities and must be weighted by how many days of the
 * period each activity actually covers (not a flat "1" per overlapping activity).
 */
describe('DrizzleMeasuredMileRepository.getLocationAllocationInputs (integration)', () => {
  const repository = new DrizzleMeasuredMileRepository();
  const projectId = randomUUID();
  const tenantId = `test-tenant-${randomUUID()}`;
  const itemNo = 999001; // no bid item / crosswalk rows exist for this item -- schedule-only fallback

  const period: PeriodQuality = {
    peNumber: 1,
    status: 'exact',
    cutoffDate: '2022-01-28',
    periodStart: '2022-01-01',
    periodEnd: '2022-01-28',
    toDateDeltaPct: 0,
    notes: null,
    sourceFile: 'test',
  };

  afterAll(async () => {
    await db.delete(contractorDelayEvents).where(eq(contractorDelayEvents.projectId, projectId));
    await db.delete(scheduleActivities).where(eq(scheduleActivities.projectId, projectId));
    await db.delete(delayAnalysisProjects).where(eq(delayAnalysisProjects.id, projectId));
  });

  it('weights schedule-activity fallback evidence by overlapping days, not a flat count per activity', async () => {
    await db.insert(delayAnalysisProjects).values({
      id: projectId,
      tenantId,
      name: 'Location Evidence Weighting Integration Test Project',
      status: 'active',
    });

    await db.insert(scheduleActivities).values([
      {
        projectId,
        tenantId,
        activityId: 'ACT-SHORT',
        wbs: '11TH',
        activityDescription: 'Short two-day activity at 11th',
        actualStartDate: new Date('2022-01-01'),
        actualFinishDate: new Date('2022-01-02'),
      },
      {
        projectId,
        tenantId,
        activityId: 'ACT-LONG',
        wbs: '12TH',
        activityDescription: 'Full-period activity at 12th',
        actualStartDate: new Date('2022-01-01'),
        actualFinishDate: new Date('2022-01-28'),
      },
    ]);

    const inputs = await repository.getLocationAllocationInputs(projectId, tenantId, itemNo, [period], NO_FILTERS);
    const activityEvidence = inputs.evidence.filter((e) => e.sourceType === 'schedule_activity');

    const shortEvidence = activityEvidence.find((e) => e.rawText === '11TH');
    const longEvidence = activityEvidence.find((e) => e.rawText === '12TH');

    expect(shortEvidence).toBeDefined();
    expect(longEvidence).toBeDefined();
    // 2-day activity vs. 28-day activity within the same period -- weight must scale with coverage,
    // not be identical (the bug this test guards against: both would have been weight 1).
    expect(shortEvidence!.weight).toBe(2);
    expect(longEvidence!.weight).toBe(28);
    expect(longEvidence!.weight).toBeGreaterThan(shortEvidence!.weight);
  });

  it('excludes an unverified delay event from the location series when verifiedOnly is set', async () => {
    await db.insert(delayAnalysisProjects).values({
      id: `${projectId}-verified-filter`,
      tenantId,
      name: 'Location Delay-Event Filter Integration Test Project',
      status: 'active',
    });
    const filterProjectId = `${projectId}-verified-filter`;

    await db.insert(contractorDelayEvents).values([
      {
        projectId: filterProjectId,
        tenantId,
        wbs: '11TH',
        eventDescription: 'Verified event at 11th',
        eventStartDate: new Date('2022-01-05'),
        eventFinishDate: new Date('2022-01-06'),
        impactDurationHours: 8,
        verificationStatus: 'verified',
      },
      {
        projectId: filterProjectId,
        tenantId,
        wbs: '12TH',
        eventDescription: 'Unverified event at 12th',
        eventStartDate: new Date('2022-01-05'),
        eventFinishDate: new Date('2022-01-06'),
        impactDurationHours: 8,
        verificationStatus: 'pending',
      },
    ]);

    try {
      const unfiltered = await repository.getLocationAllocationInputs(filterProjectId, tenantId, itemNo, [period], NO_FILTERS);
      expect(unfiltered.delayEvents.map((e) => e.wbs).sort()).toEqual(['11TH', '12TH']);

      const verifiedOnly = await repository.getLocationAllocationInputs(filterProjectId, tenantId, itemNo, [period], {
        verifiedOnly: true,
      });
      expect(verifiedOnly.delayEvents.map((e) => e.wbs)).toEqual(['11TH']);

      const wbsFiltered = await repository.getLocationAllocationInputs(filterProjectId, tenantId, itemNo, [period], {
        verifiedOnly: false,
        wbsCodes: ['12TH'],
      });
      expect(wbsFiltered.delayEvents.map((e) => e.wbs)).toEqual(['12TH']);
    } finally {
      await db.delete(contractorDelayEvents).where(eq(contractorDelayEvents.projectId, filterProjectId));
      await db.delete(delayAnalysisProjects).where(eq(delayAnalysisProjects.id, filterProjectId));
    }
  });
});
