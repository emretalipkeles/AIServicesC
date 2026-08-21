import { describe, it, expect } from 'vitest';
import { coercePodExtractionResponse } from '../PodExtractionResponseValidator';

describe('coercePodExtractionResponse', () => {
  it('returns null for a non-object response', () => {
    expect(coercePodExtractionResponse('not an object')).toBeNull();
    expect(coercePodExtractionResponse(null)).toBeNull();
    expect(coercePodExtractionResponse(42)).toBeNull();
  });

  it('coerces a well-formed response end to end', () => {
    const result = coercePodExtractionResponse({
      reportDate: '2022-09-03',
      title: 'Play of the Day',
      sections: [
        {
          crewNumber: '211',
          label: 'CIVIL #1',
          category: 'civil',
          crewMembers: ['J. BRICKMAN', 'R. CABUENA'],
          equipment: [{ name: '*JD85 EXC 30-9978*', isRental: false }],
          taskLines: [{ description: '12" TIE-IN', costCode: '164.01' }],
          trucking: 'SEE TRUCKING DISPATCH',
          traffic: '',
          notes: '',
        },
      ],
    });

    expect(result).not.toBeNull();
    expect(result!.reportDate?.toISOString().slice(0, 10)).toBe('2022-09-03');
    expect(result!.title).toBe('Play of the Day');
    expect(result!.sections).toHaveLength(1);

    const section = result!.sections[0];
    expect(section.sequence).toBe(1);
    expect(section.crewNumber).toBe('211');
    expect(section.label).toBe('CIVIL #1');
    expect(section.category).toBe('civil');
    expect(section.trucking).toBe('SEE TRUCKING DISPATCH');
    // Empty strings are coerced to null (absent optional values).
    expect(section.traffic).toBeNull();
    expect(section.notes).toBeNull();
    expect(section.crewMembers).toEqual([
      { sequence: 1, name: 'J. BRICKMAN', workerId: null },
      { sequence: 2, name: 'R. CABUENA', workerId: null },
    ]);
  });

  it('strips asterisks from equipment names and marks them as rental', () => {
    const result = coercePodExtractionResponse({
      sections: [
        {
          label: 'CIVIL #1',
          equipment: ['*JD85 EXC 30-9978*', 'Non-Rental Truck'],
        },
      ],
    });
    expect(result!.sections[0].equipment).toEqual([
      { sequence: 1, name: 'JD85 EXC 30-9978', isRental: true },
      { sequence: 2, name: 'Non-Rental Truck', isRental: false },
    ]);
  });

  it('respects an explicit isRental flag even without asterisks', () => {
    const result = coercePodExtractionResponse({
      sections: [
        {
          label: 'CIVIL #1',
          equipment: [{ name: 'JD85 EXC', is_rental: true }],
        },
      ],
    });
    expect(result!.sections[0].equipment).toEqual([
      { sequence: 1, name: 'JD85 EXC', isRental: true },
    ]);
  });

  it('preserves composite and placeholder cost codes verbatim', () => {
    const result = coercePodExtractionResponse({
      sections: [
        {
          label: 'CONCRETE #2',
          taskLines: [
            { description: 'Pour footing', costCode: '15.01 / 13.01' },
            { description: 'Cleanup', costCode: 'TBD' },
            { description: 'Standby', costCode: 'N/A' },
          ],
        },
      ],
    });
    expect(result!.sections[0].taskLines.map(t => t.costCode)).toEqual([
      '15.01 / 13.01',
      'TBD',
      'N/A',
    ]);
  });

  it('inserts sections with no crew, equipment, or task lines cleanly with empty arrays', () => {
    const result = coercePodExtractionResponse({
      sections: [{ label: 'SUBCONTRACTORS' }],
    });
    const section = result!.sections[0];
    expect(section.crewMembers).toEqual([]);
    expect(section.equipment).toEqual([]);
    expect(section.taskLines).toEqual([]);
  });

  it('skips a section missing a label rather than inserting an invalid row', () => {
    const result = coercePodExtractionResponse({
      sections: [
        { label: '', crewMembers: ['Someone'] },
        { label: 'CIVIL #1' },
      ],
    });
    expect(result!.sections).toHaveLength(1);
    expect(result!.sections[0].label).toBe('CIVIL #1');
  });

  it('accepts an unrecognized section label with an empty inferred category, never failing', () => {
    const result = coercePodExtractionResponse({
      sections: [{ label: 'NEW BLOCK TYPE NEVER SEEN BEFORE' }],
    });
    expect(result!.sections).toHaveLength(1);
    expect(result!.sections[0].label).toBe('NEW BLOCK TYPE NEVER SEEN BEFORE');
    expect(result!.sections[0].category).toBeNull();
  });

  it('assigns sequence numbers from document order when the model omits them', () => {
    const result = coercePodExtractionResponse({
      sections: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
    });
    expect(result!.sections.map(s => s.sequence)).toEqual([1, 2, 3]);
  });

  it('uses model-provided sequence numbers when present', () => {
    const result = coercePodExtractionResponse({
      sections: [{ label: 'A', sequence: 5 }],
    });
    expect(result!.sections[0].sequence).toBe(5);
  });

  it('accepts snake_case field aliases', () => {
    const result = coercePodExtractionResponse({
      report_date: '2025-04-29',
      report_title: 'MBRT 211 POD',
      sections: [
        {
          section_label: 'CIVIL #1',
          crew_number: '211',
          section_category: 'civil',
          crew_members: ['A'],
          task_lines: [{ task_text: 'Dig trench', cost_code: '164.01' }],
          trucking_note: 'dispatch',
          traffic_note: 'flaggers on site',
          other_notes: 'wet ground',
        },
      ],
    });
    expect(result!.title).toBe('MBRT 211 POD');
    const section = result!.sections[0];
    expect(section.label).toBe('CIVIL #1');
    expect(section.crewNumber).toBe('211');
    expect(section.category).toBe('civil');
    expect(section.crewMembers).toEqual([{ sequence: 1, name: 'A', workerId: null }]);
    expect(section.taskLines).toEqual([{ sequence: 1, description: 'Dig trench', costCode: '164.01' }]);
    expect(section.trucking).toBe('dispatch');
    expect(section.traffic).toBe('flaggers on site');
    expect(section.notes).toBe('wet ground');
  });

  it('handles a missing or unparseable report date by returning null rather than throwing', () => {
    const result = coercePodExtractionResponse({ sections: [{ label: 'A' }] });
    expect(result!.reportDate).toBeNull();

    const result2 = coercePodExtractionResponse({
      reportDate: 'not a date',
      sections: [{ label: 'A' }],
    });
    expect(result2!.reportDate).toBeNull();
  });

  it('defaults to an empty sections array when sections is entirely absent', () => {
    const result = coercePodExtractionResponse({ title: 'Empty report' });
    expect(result!.sections).toEqual([]);
  });
});
