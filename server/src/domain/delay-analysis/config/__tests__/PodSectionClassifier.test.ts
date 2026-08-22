import { describe, it, expect } from 'vitest';
import { classifyPodSection } from '../PodSectionClassifier';
import type { PodSection } from '../../entities/PodReport';

function makeSection(overrides: Partial<PodSection> = {}): PodSection {
  return {
    sequence: 1,
    crewNumber: '211',
    label: 'CIVIL #1',
    category: 'civil',
    trucking: null,
    traffic: null,
    notes: null,
    crewMembers: [{ sequence: 1, name: 'J. BRICKMAN', workerId: null }],
    equipment: [{ sequence: 1, name: 'JD85 EXC', isRental: true }],
    taskLines: [{ sequence: 1, description: '12" TIE-IN', costCode: '164.01' }],
    ...overrides,
  };
}

describe('classifyPodSection', () => {
  it('treats an ordinary on-project section as not excluded', () => {
    const result = classifyPodSection(makeSection());
    expect(result.isExcluded).toBe(false);
    expect(result.exclusionReason).toBeNull();
  });

  it('excludes a section whose task line references another project via @L<number>', () => {
    const section = makeSection({
      taskLines: [{ sequence: 1, description: 'SENT TO @L200 FOR PAVING', costCode: null }],
    });
    const result = classifyPodSection(section);
    expect(result.isExcluded).toBe(true);
    expect(result.exclusionReason).toBe('other_project');
    expect(result.exclusionEvidence).toMatch(/@\s*L\s*200/i);
  });

  it('excludes a section with an @L marker in notes rather than task lines', () => {
    const section = makeSection({ notes: 'Crew reassigned @L300 today' });
    const result = classifyPodSection(section);
    expect(result.isExcluded).toBe(true);
    expect(result.exclusionReason).toBe('other_project');
  });

  it('excludes a section whose only task line is OFF', () => {
    const section = makeSection({
      taskLines: [{ sequence: 1, description: 'OFF', costCode: null }],
    });
    const result = classifyPodSection(section);
    expect(result.isExcluded).toBe(true);
    expect(result.exclusionReason).toBe('off');
  });

  it('excludes a section marked OFF in trucking even if a task line exists', () => {
    const section = makeSection({ trucking: 'OFF' });
    const result = classifyPodSection(section);
    expect(result.isExcluded).toBe(true);
    expect(result.exclusionReason).toBe('off');
  });

  it('does not exclude a section that has real task lines alongside an unrelated OFF-less crew', () => {
    const section = makeSection({
      taskLines: [
        { sequence: 1, description: '12" TIE-IN', costCode: '164.01' },
        { sequence: 2, description: 'BACKFILL', costCode: '164.02' },
      ],
    });
    const result = classifyPodSection(section);
    expect(result.isExcluded).toBe(false);
  });

  it('does not treat a description merely containing the substring "off" (e.g. "cutoff") as OFF', () => {
    const section = makeSection({
      taskLines: [{ sequence: 1, description: 'PIPE CUTOFF AND TIE-IN', costCode: '164.01' }],
    });
    const result = classifyPodSection(section);
    expect(result.isExcluded).toBe(false);
  });

  it('is case-insensitive for the OFF marker', () => {
    const section = makeSection({
      taskLines: [{ sequence: 1, description: 'off', costCode: null }],
    });
    const result = classifyPodSection(section);
    expect(result.isExcluded).toBe(true);
    expect(result.exclusionReason).toBe('off');
  });
});
