import { describe, it, expect } from 'vitest';
import {
  MeasuredMileCalculator,
  type PeriodQuality,
  type RawProgressRow,
  type PeriodImpact,
  type PeriodLaborProxy,
} from '../MeasuredMileCalculator';

function period(peNumber: number, overrides: Partial<PeriodQuality> = {}): PeriodQuality {
  return {
    peNumber,
    status: 'exact',
    cutoffDate: `2022-0${peNumber}-28`,
    periodStart: `2022-0${peNumber}-01`,
    periodEnd: `2022-0${peNumber}-28`,
    toDateDeltaPct: 0,
    notes: null,
    sourceFile: 'pe.pdf',
    ...overrides,
  };
}

describe('MeasuredMileCalculator.deriveInstalledQuantity', () => {
  it('prefers the direct quantityThisEstimate value when present', () => {
    const row: RawProgressRow = { peNumber: 1, quantityThisEstimate: 100, quantityToDate: 500, amountDueThisEstimate: 1000 };
    const result = MeasuredMileCalculator.deriveInstalledQuantity(row, 400);
    expect(result).toEqual({ value: 100, source: 'direct' });
  });

  it('falls back to the quantityToDate delta when the direct field is null', () => {
    const row: RawProgressRow = { peNumber: 2, quantityThisEstimate: null, quantityToDate: 500, amountDueThisEstimate: 1000 };
    const result = MeasuredMileCalculator.deriveInstalledQuantity(row, 400);
    expect(result).toEqual({ value: 100, source: 'derived_from_to_date' });
  });

  it('reports unavailable when neither the direct value nor a prior cumulative exists', () => {
    const row: RawProgressRow = { peNumber: 3, quantityThisEstimate: null, quantityToDate: 500, amountDueThisEstimate: null };
    const result = MeasuredMileCalculator.deriveInstalledQuantity(row, null);
    expect(result).toEqual({ value: null, source: 'unavailable' });
  });

  it('reports not_reported when the item has no row at all for the period', () => {
    const result = MeasuredMileCalculator.deriveInstalledQuantity(undefined, 400);
    expect(result).toEqual({ value: 0, source: 'not_reported' });
  });
});

describe('MeasuredMileCalculator.computeWorkingDays', () => {
  it('computes an inclusive calendar-day span', () => {
    expect(MeasuredMileCalculator.computeWorkingDays('2022-01-01', '2022-01-28')).toBe(28);
  });

  it('returns null when either date is missing', () => {
    expect(MeasuredMileCalculator.computeWorkingDays(null, '2022-01-28')).toBeNull();
    expect(MeasuredMileCalculator.computeWorkingDays('2022-01-01', null)).toBeNull();
  });
});

describe('MeasuredMileCalculator.compute -- classification and window selection', () => {
  it('marks an unrecoverable period as an explicit gap, never a zero', () => {
    const periods = [period(1), period(2, { status: 'unrecoverable', notes: 'source PDF unreadable' }), period(3)];
    const progressRows: RawProgressRow[] = [
      { peNumber: 1, quantityThisEstimate: 100, quantityToDate: 100, amountDueThisEstimate: 1000 },
      { peNumber: 3, quantityThisEstimate: 100, quantityToDate: 300, amountDueThisEstimate: 1000 },
    ];

    const result = MeasuredMileCalculator.compute({
      itemNo: 42,
      manHoursPerUnit: 1,
      periodQualities: periods,
      progressRows,
      impactByPeriod: new Map(),
      laborProxyByPeriod: new Map(),
      manualAccelerationPeNumbers: new Set(),
      measuredMileOverride: null,
    });

    const gapPoint = result.points.find((p) => p.peNumber === 2)!;
    expect(gapPoint.isGap).toBe(true);
    expect(gapPoint.periodClass).toBe('gap');
    expect(gapPoint.installedQuantity).toBeNull();
    expect(gapPoint.gapReason).toContain('unreadable');

    // The period after a gap cannot trust the to-date delta (the cumulative trail is broken).
    const afterGap = result.points.find((p) => p.peNumber === 3)!;
    expect(afterGap.quantityDeltaSource).toBe('direct');
  });

  it('classifies an impacted period and excludes it from the auto-selected measured-mile window', () => {
    const periods = [period(1), period(2), period(3), period(4), period(5)];
    const progressRows: RawProgressRow[] = periods.map((p) => ({
      peNumber: p.peNumber,
      quantityThisEstimate: 100,
      quantityToDate: p.peNumber * 100,
      amountDueThisEstimate: 1000,
    }));
    const impactByPeriod = new Map<number, PeriodImpact>([[3, { peNumber: 3, impactHours: 40, eventIds: ['evt-1'] }]]);

    const result = MeasuredMileCalculator.compute({
      itemNo: 42,
      manHoursPerUnit: 2,
      periodQualities: periods,
      progressRows,
      impactByPeriod,
      laborProxyByPeriod: new Map(),
      manualAccelerationPeNumbers: new Set(),
      measuredMileOverride: null,
      minMeasuredMileRunLength: 2,
    });

    const impacted = result.points.find((p) => p.peNumber === 3)!;
    expect(impacted.periodClass).toBe('impact');
    expect(result.measuredMileWindow).not.toBeNull();
    expect(result.measuredMileWindow!.startPeNumber === 3 || result.measuredMileWindow!.endPeNumber === 3).toBe(false);
  });

  it('lets a manual acceleration tag win over auto classification', () => {
    const periods = [period(1), period(2), period(3)];
    const progressRows: RawProgressRow[] = periods.map((p) => ({
      peNumber: p.peNumber,
      quantityThisEstimate: 100,
      quantityToDate: p.peNumber * 100,
      amountDueThisEstimate: 1000,
    }));

    const result = MeasuredMileCalculator.compute({
      itemNo: 42,
      manHoursPerUnit: 1,
      periodQualities: periods,
      progressRows,
      impactByPeriod: new Map(),
      laborProxyByPeriod: new Map(),
      manualAccelerationPeNumbers: new Set([2]),
      measuredMileOverride: null,
      minMeasuredMileRunLength: 2,
    });

    const tagged = result.points.find((p) => p.peNumber === 2)!;
    expect(tagged.periodClass).toBe('acceleration');
    expect(tagged.isManualAcceleration).toBe(true);
  });

  it('honors a user-supplied measured-mile window override even over an impacted period', () => {
    const periods = [period(1), period(2), period(3), period(4)];
    const progressRows: RawProgressRow[] = periods.map((p) => ({
      peNumber: p.peNumber,
      quantityThisEstimate: 100,
      quantityToDate: p.peNumber * 100,
      amountDueThisEstimate: 1000,
    }));
    const impactByPeriod = new Map<number, PeriodImpact>([[2, { peNumber: 2, impactHours: 10, eventIds: ['evt-1'] }]]);

    const result = MeasuredMileCalculator.compute({
      itemNo: 42,
      manHoursPerUnit: 1,
      periodQualities: periods,
      progressRows,
      impactByPeriod,
      laborProxyByPeriod: new Map(),
      manualAccelerationPeNumbers: new Set(),
      measuredMileOverride: { startPeNumber: 1, endPeNumber: 3 },
    });

    expect(result.measuredMileWindow).toMatchObject({ startPeNumber: 1, endPeNumber: 3, isAutoSelected: false });
    const overriddenImpactPoint = result.points.find((p) => p.peNumber === 2)!;
    expect(overriddenImpactPoint.periodClass).toBe('measured_mile');
  });

  it('picks the highest-sustained-rate run when multiple eligible runs exist', () => {
    const periods = [period(1), period(2), period(3), period(4), period(5), period(6), period(7)];
    // Periods 1-3: slow run (50/period). Period 4: impacted (breaks runs). Periods 5-7: fast run (150/period).
    const quantities: Record<number, number> = { 1: 50, 2: 50, 3: 50, 4: 10, 5: 150, 6: 150, 7: 150 };
    const progressRows: RawProgressRow[] = periods.map((p) => ({
      peNumber: p.peNumber,
      quantityThisEstimate: quantities[p.peNumber],
      quantityToDate: null,
      amountDueThisEstimate: null,
    }));
    const impactByPeriod = new Map<number, PeriodImpact>([[4, { peNumber: 4, impactHours: 20, eventIds: ['evt-1'] }]]);

    const result = MeasuredMileCalculator.compute({
      itemNo: 42,
      manHoursPerUnit: 1,
      periodQualities: periods,
      progressRows,
      impactByPeriod,
      laborProxyByPeriod: new Map(),
      manualAccelerationPeNumbers: new Set(),
      measuredMileOverride: null,
      minMeasuredMileRunLength: 3,
    });

    expect(result.measuredMileWindow).toMatchObject({ startPeNumber: 5, endPeNumber: 7 });
  });
});

describe('MeasuredMileCalculator.compute -- loss statistics', () => {
  it('computes a positive estimated lost man-hours figure when impacted unit rate exceeds baseline', () => {
    const periods = [period(1), period(2), period(3), period(4)];
    const progressRows: RawProgressRow[] = [
      { peNumber: 1, quantityThisEstimate: 100, quantityToDate: null, amountDueThisEstimate: null },
      { peNumber: 2, quantityThisEstimate: 100, quantityToDate: null, amountDueThisEstimate: null },
      { peNumber: 3, quantityThisEstimate: 50, quantityToDate: null, amountDueThisEstimate: null },
      { peNumber: 4, quantityThisEstimate: 100, quantityToDate: null, amountDueThisEstimate: null },
    ];
    // Baseline periods (1,2,4) get 1 actual hour per unit (100 proxy hours / 100 units).
    // Impacted period 3 gets 4 actual hours per unit (200 proxy hours / 50 units) -- much less efficient.
    const laborProxyByPeriod = new Map<number, PeriodLaborProxy>([
      [1, { peNumber: 1, actualProxyHours: 100, podReportCount: 5 }],
      [2, { peNumber: 2, actualProxyHours: 100, podReportCount: 5 }],
      [3, { peNumber: 3, actualProxyHours: 200, podReportCount: 5 }],
      [4, { peNumber: 4, actualProxyHours: 100, podReportCount: 5 }],
    ]);
    const impactByPeriod = new Map<number, PeriodImpact>([[3, { peNumber: 3, impactHours: 30, eventIds: ['evt-1'] }]]);

    const result = MeasuredMileCalculator.compute({
      itemNo: 42,
      manHoursPerUnit: 1,
      periodQualities: periods,
      progressRows,
      impactByPeriod,
      laborProxyByPeriod,
      manualAccelerationPeNumbers: new Set(),
      measuredMileOverride: null,
      minMeasuredMileRunLength: 2,
    });

    expect(result.lossStatistics.hasProxyData).toBe(true);
    expect(result.lossStatistics.estimatedLostManHours).not.toBeNull();
    expect(result.lossStatistics.estimatedLostManHours!).toBeGreaterThan(0);
    // impactedQuantityTotal should equal the single impacted period's installed quantity.
    expect(result.lossStatistics.impactedQuantityTotal).toBe(50);
  });

  it('returns nulls (not zeros) for loss statistics when no measured-mile window is found', () => {
    const periods = [period(1)];
    const progressRows: RawProgressRow[] = [{ peNumber: 1, quantityThisEstimate: 0, quantityToDate: null, amountDueThisEstimate: null }];

    const result = MeasuredMileCalculator.compute({
      itemNo: 42,
      manHoursPerUnit: 1,
      periodQualities: periods,
      progressRows,
      impactByPeriod: new Map(),
      laborProxyByPeriod: new Map(),
      manualAccelerationPeNumbers: new Set(),
      measuredMileOverride: null,
    });

    expect(result.measuredMileWindow).toBeNull();
    expect(result.lossStatistics.measuredMileBaselineRatePerDay).toBeNull();
    expect(result.lossStatistics.estimatedLostManHours).toBeNull();
  });
});
