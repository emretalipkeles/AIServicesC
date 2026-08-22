import { describe, it, expect } from 'vitest';
import { renderPodDayContext } from '../PodContextRenderer';
import { PodReport } from '../../../domain/delay-analysis/entities/PodReport';
import { randomUUID } from 'crypto';

function makePodReport(sections: PodReport['sections']): PodReport {
  return new PodReport({
    id: randomUUID(),
    sourceDocumentId: randomUUID(),
    projectId: 'proj-1',
    tenantId: 'tenant-1',
    reportDate: new Date('2024-05-01'),
    title: 'Play of the Day',
    sections,
  });
}

describe('renderPodDayContext', () => {
  it('returns null when there are no POD reports', () => {
    expect(renderPodDayContext([])).toBeNull();
  });

  it('renders on-project sections with crew, equipment, task lines, and cost codes', () => {
    const report = makePodReport([
      {
        sequence: 1,
        crewNumber: '211',
        label: 'CIVIL #1',
        category: 'civil',
        trucking: 'See dispatch',
        traffic: null,
        notes: 'Weather delayed start',
        crewMembers: [{ sequence: 1, name: 'J. Brickman', workerId: null }],
        equipment: [{ sequence: 1, name: 'JD85 EXC', isRental: true }],
        taskLines: [{ sequence: 1, description: '12" TIE-IN', costCode: '164.01' }],
      },
    ]);

    const text = renderPodDayContext([report]);
    expect(text).not.toBeNull();
    expect(text).toContain('Crew 211');
    expect(text).toContain('CIVIL #1');
    expect(text).toContain('JD85 EXC');
    expect(text).toContain('12" TIE-IN');
    expect(text).toContain('164.01');
    expect(text).toContain('Weather delayed start');
    expect(text).toContain('Crews/equipment working on THIS project');
  });

  it('lists excluded sections separately as NOT evidence, never merged with on-project evidence', () => {
    const report = makePodReport([
      {
        sequence: 1,
        crewNumber: '212',
        label: 'CIVIL #2',
        category: null,
        trucking: null,
        traffic: null,
        notes: null,
        crewMembers: [],
        equipment: [],
        taskLines: [{ sequence: 1, description: 'Sent @L200 for paving', costCode: null }],
      },
      {
        sequence: 2,
        crewNumber: '213',
        label: 'CIVIL #3',
        category: null,
        trucking: null,
        traffic: null,
        notes: null,
        crewMembers: [],
        equipment: [],
        taskLines: [{ sequence: 1, description: 'OFF', costCode: null }],
      },
    ]);

    const text = renderPodDayContext([report]);
    expect(text).toContain('Resources NOT on this project that day');
    expect(text).toContain('Crew 212');
    expect(text).toContain('Crew 213');
    expect(text).toContain('NOT evidence of work on this project');
    expect(text).not.toContain('Crews/equipment working on THIS project');
  });

  it('caps rendered output length so it cannot crowd out the schedule list', () => {
    const manySections = Array.from({ length: 300 }, (_, i) => ({
      sequence: i + 1,
      crewNumber: String(i),
      label: `CIVIL #${i}`,
      category: 'civil',
      trucking: null,
      traffic: null,
      notes: 'Long note '.repeat(20),
      crewMembers: [],
      equipment: [],
      taskLines: [{ sequence: 1, description: `Task line number ${i} with a long description`, costCode: `164.${i}` }],
    }));
    const report = makePodReport(manySections);

    const text = renderPodDayContext([report]);
    expect(text).not.toBeNull();
    expect(text!.length).toBeLessThanOrEqual(4000 + '\n[... POD context truncated ...]'.length);
    expect(text).toContain('truncated');
  });

  it('returns null when reports have no sections at all', () => {
    const report = makePodReport([]);
    expect(renderPodDayContext([report])).toBeNull();
  });
});
