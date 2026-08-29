import { describe, it, expect } from 'vitest';
import { CorridorLocationAllocationCalculator, type LocationEvidenceCandidate, type DelayEventLocationCandidate } from '../CorridorLocationAllocationCalculator';
import { DEFAULT_CORRIDOR_LOCATIONS } from '../CorridorLocationModel';
import type { MetricPoint } from '../MeasuredMileCalculator';

function point(overrides: Partial<MetricPoint> = {}): MetricPoint {
  return {
    peNumber: 1,
    cutoffDate: '2022-01-28',
    periodStart: '2022-01-01',
    periodEnd: '2022-01-28',
    workingDays: 28,
    isGap: false,
    gapReason: null,
    installedQuantity: 100,
    quantityDeltaSource: 'direct',
    earnedManHours: 200,
    earnedManHoursPerDay: 7.14,
    productionRatePerDay: 3.57,
    earnedDollars: 5000,
    actualProxyHours: 180,
    actualProxySourceDocuments: [],
    productivityIndex: 1.1,
    dataQualityStatus: 'exact',
    dataQualityDeltaPct: 0,
    dataQualityNotes: null,
    dataQualitySourceFile: 'pe1.pdf',
    periodClass: 'neutral',
    impactHours: 0,
    impactEventIds: [],
    isManualAcceleration: false,
    ...overrides,
  };
}

const noOverrides = { get: () => undefined };

describe('CorridorLocationAllocationCalculator.compute', () => {
  it('allocates a period entirely to a single matched location from POD evidence', () => {
    const evidence: LocationEvidenceCandidate[] = [
      { peNumber: 1, sourceType: 'pod_task_line', rawText: '13TH / MADISON STORM WORK', weight: 4, documentName: 'pod-01-05.pdf' },
    ];
    const result = CorridorLocationAllocationCalculator.compute({
      itemNo: 100,
      itemDescription: 'Storm Drainage Pipe',
      manHoursPerUnit: 2,
      points: [point()],
      evidence,
      delayEvents: [],
      locations: DEFAULT_CORRIDOR_LOCATIONS,
      overrides: noOverrides,
    });

    const loc13th = result.locations.find((l) => l.key === '13th')!;
    expect(loc13th.totalAllocatedQuantity).toBe(100);
    expect(loc13th.confidenceTier).toBe('measured');
    expect(loc13th.contributingPeriods).toHaveLength(1);
    expect(result.unallocatedPeriods).toHaveLength(0);

    const loc12th = result.locations.find((l) => l.key === '12th')!;
    expect(loc12th.totalAllocatedQuantity).toBeNull();
    expect(loc12th.confidenceTier).toBe('no_data');
  });

  it('splits a range match evenly across every spanned station', () => {
    const evidence: LocationEvidenceCandidate[] = [
      { peNumber: 1, sourceType: 'pod_task_line', rawText: '11TH TO 12TH SOUTH SIDE', weight: 2, documentName: 'pod.pdf' },
    ];
    const result = CorridorLocationAllocationCalculator.compute({
      itemNo: 100,
      itemDescription: null,
      manHoursPerUnit: null,
      points: [point()],
      evidence,
      delayEvents: [],
      locations: DEFAULT_CORRIDOR_LOCATIONS,
      overrides: noOverrides,
    });
    const loc11th = result.locations.find((l) => l.key === '11th')!;
    const loc12th = result.locations.find((l) => l.key === '12th')!;
    expect(loc11th.totalAllocatedQuantity).toBe(50);
    expect(loc12th.totalAllocatedQuantity).toBe(50);
  });

  it('falls back to schedule-activity evidence only when POD evidence is absent for the period', () => {
    const evidence: LocationEvidenceCandidate[] = [
      { peNumber: 1, sourceType: 'schedule_activity', rawText: 'MADISON AND 13TH', weight: 1, documentName: null },
    ];
    const result = CorridorLocationAllocationCalculator.compute({
      itemNo: 100,
      itemDescription: null,
      manHoursPerUnit: null,
      points: [point()],
      evidence,
      delayEvents: [],
      locations: DEFAULT_CORRIDOR_LOCATIONS,
      overrides: noOverrides,
    });
    const loc13th = result.locations.find((l) => l.key === '13th')!;
    expect(loc13th.totalAllocatedQuantity).toBe(100);
    expect(loc13th.confidenceTier).toBe('estimated'); // schedule-activity-only, never 'measured'
  });

  it('prefers POD evidence over schedule-activity evidence in the same period', () => {
    const evidence: LocationEvidenceCandidate[] = [
      { peNumber: 1, sourceType: 'pod_task_line', rawText: '13TH WORK', weight: 3, documentName: 'pod.pdf' },
      { peNumber: 1, sourceType: 'schedule_activity', rawText: '5TH AVE WORK', weight: 1, documentName: null },
    ];
    const result = CorridorLocationAllocationCalculator.compute({
      itemNo: 100,
      itemDescription: null,
      manHoursPerUnit: null,
      points: [point()],
      evidence,
      delayEvents: [],
      locations: DEFAULT_CORRIDOR_LOCATIONS,
      overrides: noOverrides,
    });
    expect(result.locations.find((l) => l.key === '13th')!.totalAllocatedQuantity).toBe(100);
    expect(result.locations.find((l) => l.key === '5th')!.totalAllocatedQuantity).toBeNull();
  });

  it('never fabricates a distribution: a period with zero resolvable evidence is recorded as unallocated', () => {
    const evidence: LocationEvidenceCandidate[] = [
      { peNumber: 1, sourceType: 'pod_task_line', rawText: 'MOBILIZATION GENERAL', weight: 2, documentName: 'pod.pdf' },
    ];
    const result = CorridorLocationAllocationCalculator.compute({
      itemNo: 100,
      itemDescription: null,
      manHoursPerUnit: null,
      points: [point()],
      evidence,
      delayEvents: [],
      locations: DEFAULT_CORRIDOR_LOCATIONS,
      overrides: noOverrides,
    });
    expect(result.unallocatedPeriods).toEqual([{ peNumber: 1, installedQuantity: 100, reason: expect.any(String) }]);
    expect(result.unmatchedEvidenceSamples).toContain('MOBILIZATION GENERAL');
    expect(result.locations.every((l) => l.totalAllocatedQuantity === null)).toBe(true);
  });

  it('respects an exact-text override ahead of the regex matcher', () => {
    const evidence: LocationEvidenceCandidate[] = [
      { peNumber: 1, sourceType: 'pod_task_line', rawText: 'BLOCK X MISC WORK', weight: 2, documentName: 'pod.pdf' },
    ];
    const overrides = { get: (raw: string) => (raw === 'block x misc work' ? ['9th'] : undefined) };
    const result = CorridorLocationAllocationCalculator.compute({
      itemNo: 100,
      itemDescription: null,
      manHoursPerUnit: null,
      points: [point()],
      evidence,
      delayEvents: [],
      locations: DEFAULT_CORRIDOR_LOCATIONS,
      overrides,
    });
    expect(result.locations.find((l) => l.key === '9th')!.totalAllocatedQuantity).toBe(100);
    expect(result.unallocatedPeriods).toHaveLength(0);
  });

  it('forces impact classification on a location-period pair when a delay event WBS matches and dates overlap', () => {
    const evidence: LocationEvidenceCandidate[] = [
      { peNumber: 1, sourceType: 'pod_task_line', rawText: '13TH WORK', weight: 2, documentName: 'pod.pdf' },
    ];
    const delayEvents: DelayEventLocationCandidate[] = [
      {
        eventId: 'evt-1',
        wbs: '13TH',
        eventDescription: 'Utility conflict at 13th',
        eventStartDate: '2022-01-10',
        eventFinishDate: '2022-01-12',
        impactDurationHours: 8,
      },
    ];
    const result = CorridorLocationAllocationCalculator.compute({
      itemNo: 100,
      itemDescription: null,
      manHoursPerUnit: null,
      points: [point({ periodClass: 'measured_mile' })],
      evidence,
      delayEvents,
      locations: DEFAULT_CORRIDOR_LOCATIONS,
      overrides: noOverrides,
    });
    const loc13th = result.locations.find((l) => l.key === '13th')!;
    expect(loc13th.contributingPeriods[0].periodClass).toBe('impact');
    expect(loc13th.contributingPeriods[0].forcedImpactByLocationEvent).toBe(true);
    expect(loc13th.overlaidDelayEvents).toEqual([
      { eventId: 'evt-1', wbs: '13TH', eventDescription: 'Utility conflict at 13th', eventStartDate: '2022-01-10', eventFinishDate: '2022-01-12', impactDurationHours: 8, overlapsProductionPeriod: true },
    ]);
  });

  it('lists a non-overlapping delay event for context without forcing impact classification', () => {
    const evidence: LocationEvidenceCandidate[] = [
      { peNumber: 1, sourceType: 'pod_task_line', rawText: '13TH WORK', weight: 2, documentName: 'pod.pdf' },
    ];
    const delayEvents: DelayEventLocationCandidate[] = [
      {
        eventId: 'evt-2',
        wbs: '13TH',
        eventDescription: 'Earlier conflict, different period',
        eventStartDate: '2021-06-01',
        eventFinishDate: '2021-06-02',
        impactDurationHours: 4,
      },
    ];
    const result = CorridorLocationAllocationCalculator.compute({
      itemNo: 100,
      itemDescription: null,
      manHoursPerUnit: null,
      points: [point({ periodClass: 'measured_mile' })],
      evidence,
      delayEvents,
      locations: DEFAULT_CORRIDOR_LOCATIONS,
      overrides: noOverrides,
    });
    const loc13th = result.locations.find((l) => l.key === '13th')!;
    expect(loc13th.contributingPeriods[0].periodClass).toBe('measured_mile');
    expect(loc13th.overlaidDelayEvents[0].overlapsProductionPeriod).toBe(false);
  });

  it('marks thin confidence when a location only receives a small fractional share of evidence', () => {
    const evidence: LocationEvidenceCandidate[] = [
      { peNumber: 1, sourceType: 'pod_task_line', rawText: '13TH WORK', weight: 9, documentName: 'pod.pdf' },
      { peNumber: 1, sourceType: 'pod_task_line', rawText: '14TH WORK', weight: 1, documentName: 'pod.pdf' },
    ];
    const result = CorridorLocationAllocationCalculator.compute({
      itemNo: 100,
      itemDescription: null,
      manHoursPerUnit: null,
      points: [point()],
      evidence,
      delayEvents: [],
      locations: DEFAULT_CORRIDOR_LOCATIONS,
      overrides: noOverrides,
    });
    expect(result.locations.find((l) => l.key === '14th')!.confidenceTier).toBe('thin');
    expect(result.locations.find((l) => l.key === '13th')!.confidenceTier).toBe('measured');
  });

  it('falls back to a schedule activity description for location matching when its WBS is generic, non-location text', () => {
    const evidence: LocationEvidenceCandidate[] = [
      {
        peNumber: 1,
        sourceType: 'schedule_activity',
        rawText: 'GENERAL MOBILIZATION', // not a location string
        secondaryLocationText: 'MADISON AND 13TH', // real location signal lives here instead
        itemRelevanceText: 'MADISON AND 13TH',
        weight: 1,
        documentName: null,
      },
    ];
    const result = CorridorLocationAllocationCalculator.compute({
      itemNo: 100,
      itemDescription: null,
      manHoursPerUnit: null,
      points: [point()],
      evidence,
      delayEvents: [],
      locations: DEFAULT_CORRIDOR_LOCATIONS,
      overrides: noOverrides,
    });
    const loc13th = result.locations.find((l) => l.key === '13th')!;
    expect(loc13th.totalAllocatedQuantity).toBe(100);
    expect(loc13th.contributingPeriods[0].evidence[0].rawText).toBe('MADISON AND 13TH');
    expect(result.unallocatedPeriods).toHaveLength(0);
    expect(result.unmatchedEvidenceSamples).not.toContain('GENERAL MOBILIZATION');
  });

  it('judges schedule-activity item relevance against the description, not a location-only WBS', () => {
    // Both activities have a WBS (so the old rawText-based relevance filter would see pure
    // location text with no work keywords for either, and effectively disable itself); only the
    // description of the second activity actually names the target item's work.
    const evidence: LocationEvidenceCandidate[] = [
      {
        peNumber: 1,
        sourceType: 'schedule_activity',
        rawText: '5TH AVE',
        itemRelevanceText: 'Traffic signal pole install',
        weight: 1,
        documentName: null,
      },
      {
        peNumber: 1,
        sourceType: 'schedule_activity',
        rawText: '13TH AVE',
        itemRelevanceText: 'Curb and gutter concrete pour',
        weight: 1,
        documentName: null,
      },
    ];
    const result = CorridorLocationAllocationCalculator.compute({
      itemNo: 100,
      itemDescription: 'Curb and Gutter',
      manHoursPerUnit: null,
      points: [point()],
      evidence,
      delayEvents: [],
      locations: DEFAULT_CORRIDOR_LOCATIONS,
      overrides: noOverrides,
    });
    // Only the relevant (13th) activity should have been chosen -- 5th gets nothing.
    expect(result.locations.find((l) => l.key === '13th')!.totalAllocatedQuantity).toBe(100);
    expect(result.locations.find((l) => l.key === '5th')!.totalAllocatedQuantity).toBeNull();
  });

  it('falls back to a delay event description for location matching when its WBS is generic, non-location text', () => {
    const evidence: LocationEvidenceCandidate[] = [
      { peNumber: 1, sourceType: 'pod_task_line', rawText: '9TH WORK', weight: 2, documentName: 'pod.pdf' },
    ];
    const delayEvents: DelayEventLocationCandidate[] = [
      {
        eventId: 'evt-3',
        wbs: 'GENERAL', // not a location string
        eventDescription: 'Utility conflict near 9th and Spring',
        eventStartDate: '2022-01-10',
        eventFinishDate: '2022-01-12',
        impactDurationHours: 6,
      },
    ];
    const result = CorridorLocationAllocationCalculator.compute({
      itemNo: 100,
      itemDescription: null,
      manHoursPerUnit: null,
      points: [point({ periodClass: 'measured_mile' })],
      evidence,
      delayEvents,
      locations: DEFAULT_CORRIDOR_LOCATIONS,
      overrides: noOverrides,
    });
    const loc9th = result.locations.find((l) => l.key === '9th')!;
    expect(loc9th.overlaidDelayEvents).toHaveLength(1);
    expect(loc9th.contributingPeriods[0].forcedImpactByLocationEvent).toBe(true);
  });

  it('skips gap periods and periods with zero installed quantity entirely', () => {
    const evidence: LocationEvidenceCandidate[] = [
      { peNumber: 1, sourceType: 'pod_task_line', rawText: '13TH WORK', weight: 2, documentName: 'pod.pdf' },
    ];
    const result = CorridorLocationAllocationCalculator.compute({
      itemNo: 100,
      itemDescription: null,
      manHoursPerUnit: null,
      points: [point({ isGap: true, installedQuantity: null })],
      evidence,
      delayEvents: [],
      locations: DEFAULT_CORRIDOR_LOCATIONS,
      overrides: noOverrides,
    });
    expect(result.unallocatedPeriods).toHaveLength(0);
    expect(result.locations.every((l) => l.totalAllocatedQuantity === null)).toBe(true);
  });
});
