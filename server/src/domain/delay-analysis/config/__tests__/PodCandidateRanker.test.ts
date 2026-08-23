import { describe, it, expect } from 'vitest';
import { findPodCorroboration, rankActivitiesByPodEvidence } from '../PodCandidateRanker';
import { PodReport } from '../../entities/PodReport';
import { ScheduleActivity } from '../../entities/ScheduleActivity';
import { randomUUID } from 'crypto';

function makeActivity(overrides: Partial<{ activityId: string; wbs: string | null; activityDescription: string }>): ScheduleActivity {
  return new ScheduleActivity({
    id: randomUUID(),
    projectId: 'proj-1',
    tenantId: 'tenant-1',
    activityId: overrides.activityId ?? 'A1000',
    wbs: overrides.wbs ?? null,
    activityDescription: overrides.activityDescription ?? 'Generic activity',
    isCriticalPath: 'No',
    createdAt: new Date(),
  });
}

function makePodReport(sections: PodReport['sections']): PodReport {
  return new PodReport({
    id: randomUUID(),
    sourceDocumentId: randomUUID(),
    projectId: 'proj-1',
    tenantId: 'tenant-1',
    reportDate: new Date('2024-05-01'),
    title: 'POD',
    sections,
  });
}

describe('findPodCorroboration', () => {
  it('corroborates via a matching cost code appearing in the activity id/wbs/description', () => {
    const report = makePodReport([
      {
        sequence: 1,
        crewNumber: '211',
        label: 'CIVIL #1',
        category: null,
        trucking: null,
        traffic: null,
        notes: null,
        crewMembers: [],
        equipment: [],
        taskLines: [{ sequence: 1, description: '12" TIE-IN', costCode: '164.01' }],
      },
    ]);
    const activity = makeActivity({ activityId: '164.01-TIE-IN', activityDescription: 'Install 12" tie-in' });
    const result = findPodCorroboration(activity, [report]);
    expect(result).not.toBeNull();
    expect(result!.costCode).toBe('164.01');
  });

  it('corroborates via keyword overlap when no cost code matches', () => {
    const report = makePodReport([
      {
        sequence: 1,
        crewNumber: null,
        label: 'CIVIL #1',
        category: null,
        trucking: null,
        traffic: null,
        notes: null,
        crewMembers: [],
        equipment: [],
        taskLines: [{ sequence: 1, description: 'Station 45+00 storm drain installation', costCode: null }],
      },
    ]);
    const activity = makeActivity({ activityDescription: 'Storm drain work near Station 45+00' });
    const result = findPodCorroboration(activity, [report]);
    expect(result).not.toBeNull();
    expect(result!.matchedKeyword).toBeTruthy();
  });

  it('returns null when nothing in the POD corroborates the activity', () => {
    const report = makePodReport([
      {
        sequence: 1,
        crewNumber: null,
        label: 'CIVIL #1',
        category: null,
        trucking: null,
        traffic: null,
        notes: null,
        crewMembers: [],
        equipment: [],
        taskLines: [{ sequence: 1, description: 'Paving on 5th Ave', costCode: '200.00' }],
      },
    ]);
    const activity = makeActivity({ activityDescription: 'Electrical conduit installation' });
    expect(findPodCorroboration(activity, [report])).toBeNull();
  });

  it('never uses an excluded (other-project) section as corroborating evidence', () => {
    const report = makePodReport([
      {
        sequence: 1,
        crewNumber: null,
        label: 'CIVIL #1',
        category: null,
        trucking: null,
        traffic: null,
        notes: null,
        crewMembers: [],
        equipment: [],
        taskLines: [{ sequence: 1, description: 'Storm drain @L200 work', costCode: '164.01' }],
      },
    ]);
    const activity = makeActivity({ activityId: '164.01', activityDescription: 'Storm drain work' });
    expect(findPodCorroboration(activity, [report])).toBeNull();
  });

  it('attributes corroboration to the exact report that supplied the matching task line, not just the first report for the date', () => {
    const nonCorroboratingReport = makePodReport([
      {
        sequence: 1,
        crewNumber: '100',
        label: 'ELECTRICAL',
        category: null,
        trucking: null,
        traffic: null,
        notes: null,
        crewMembers: [],
        equipment: [],
        taskLines: [{ sequence: 1, description: 'Panel wiring on 5th Ave', costCode: '900.00' }],
      },
    ]);
    const corroboratingReport = makePodReport([
      {
        sequence: 1,
        crewNumber: '211',
        label: 'CIVIL #1',
        category: null,
        trucking: null,
        traffic: null,
        notes: null,
        crewMembers: [],
        equipment: [],
        taskLines: [{ sequence: 1, description: '12" TIE-IN', costCode: '164.01' }],
      },
    ]);
    const activity = makeActivity({ activityId: '164.01-TIE-IN', activityDescription: 'Install 12" tie-in' });

    // Two POD reports exist for the same date; only the second one actually corroborates.
    const result = findPodCorroboration(activity, [nonCorroboratingReport, corroboratingReport]);

    expect(result).not.toBeNull();
    expect(result!.report.sourceDocumentId).toBe(corroboratingReport.sourceDocumentId);
    expect(result!.report.sourceDocumentId).not.toBe(nonCorroboratingReport.sourceDocumentId);
  });

  it('never uses an OFF section as corroborating evidence', () => {
    const report = makePodReport([
      {
        sequence: 1,
        crewNumber: null,
        label: 'CIVIL #1',
        category: null,
        trucking: null,
        traffic: null,
        notes: null,
        crewMembers: [],
        equipment: [],
        taskLines: [{ sequence: 1, description: 'OFF', costCode: null }],
      },
    ]);
    const activity = makeActivity({ activityDescription: 'OFF' });
    expect(findPodCorroboration(activity, [report])).toBeNull();
  });
});

describe('rankActivitiesByPodEvidence', () => {
  it('moves POD-corroborated activities to the front while preserving relative order otherwise', () => {
    const report = makePodReport([
      {
        sequence: 1,
        crewNumber: null,
        label: 'CIVIL #1',
        category: null,
        trucking: null,
        traffic: null,
        notes: null,
        crewMembers: [],
        equipment: [],
        taskLines: [{ sequence: 1, description: '12" TIE-IN', costCode: '164.01' }],
      },
    ]);

    const unrelated1 = makeActivity({ activityId: 'A100', activityDescription: 'Unrelated activity one' });
    const corroborated = makeActivity({ activityId: '164.01', activityDescription: 'Install 12" tie-in' });
    const unrelated2 = makeActivity({ activityId: 'A200', activityDescription: 'Unrelated activity two' });

    const ranked = rankActivitiesByPodEvidence([unrelated1, corroborated, unrelated2], [report]);

    expect(ranked[0]).toBe(corroborated);
    expect(ranked[1]).toBe(unrelated1);
    expect(ranked[2]).toBe(unrelated2);
  });

  it('returns activities unchanged when there is no POD evidence for the day', () => {
    const activities = [makeActivity({ activityId: 'A1' }), makeActivity({ activityId: 'A2' })];
    expect(rankActivitiesByPodEvidence(activities, [])).toEqual(activities);
  });

  it('returns activities unchanged when POD reports have no on-project task lines', () => {
    const report = makePodReport([
      {
        sequence: 1,
        crewNumber: null,
        label: 'CIVIL #1',
        category: null,
        trucking: null,
        traffic: null,
        notes: null,
        crewMembers: [],
        equipment: [],
        taskLines: [{ sequence: 1, description: 'OFF', costCode: null }],
      },
    ]);
    const activities = [makeActivity({ activityId: 'A1' }), makeActivity({ activityId: 'A2' })];
    expect(rankActivitiesByPodEvidence(activities, [report])).toEqual(activities);
  });
});
