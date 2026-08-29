import { describe, it, expect } from 'vitest';
import { buildChartRows } from '../measured-mile-chart-data';
import type { MetricPointDto } from '@/lib/measured-mile-api';

function point(overrides: Partial<MetricPointDto> & { peNumber: number }): MetricPointDto {
  return {
    cutoffDate: null,
    periodStart: null,
    periodEnd: null,
    workingDays: 30,
    isGap: false,
    gapReason: null,
    installedQuantity: 100,
    quantityDeltaSource: 'direct',
    earnedManHours: 100,
    earnedManHoursPerDay: 3.33,
    productionRatePerDay: 3.33,
    earnedDollars: 1000,
    actualProxyHours: null,
    actualProxySourceDocuments: [],
    productivityIndex: null,
    dataQualityStatus: 'exact',
    dataQualityDeltaPct: null,
    dataQualityNotes: null,
    dataQualitySourceFile: 'pe.pdf',
    periodClass: 'neutral',
    impactHours: 0,
    impactEventIds: [],
    isManualAcceleration: false,
    ...overrides,
  };
}

describe('buildChartRows', () => {
  const points: MetricPointDto[] = [
    point({ peNumber: 1, periodStart: '2021-10-18', periodEnd: '2021-10-30', earnedManHours: 100, earnedDollars: 1000 }),
    // Unrecoverable period: contributes nothing and carries no date at all.
    point({
      peNumber: 2,
      isGap: true,
      periodClass: 'gap',
      installedQuantity: null,
      earnedManHours: null,
      earnedManHoursPerDay: null,
      productionRatePerDay: null,
      earnedDollars: null,
      quantityDeltaSource: 'unavailable',
      dataQualityStatus: 'unrecoverable',
    }),
    point({ peNumber: 3, periodStart: '2021-12-01', periodEnd: '2021-12-30', earnedManHours: 50, earnedDollars: 500 }),
  ];

  it('runs cumulative totals across the series without resetting at a data gap', () => {
    const { rows } = buildChartRows(points, 'cumulativeEarnedManHours', 'pe');

    expect(rows.map((r) => r.value)).toEqual([100, null, 150]);
  });

  it('accumulates dollars independently of man-hours', () => {
    const { rows } = buildChartRows(points, 'cumulativeEarnedDollars', 'pe');

    expect(rows.map((r) => r.value)).toEqual([1000, null, 1500]);
  });

  it('labels by PE number, by date, and keeps a PE fallback for dateless periods', () => {
    expect(buildChartRows(points, 'productionRatePerDay', 'pe').rows.map((r) => r.label)).toEqual(['PE1', 'PE2', 'PE3']);
    expect(buildChartRows(points, 'productionRatePerDay', 'date').rows.map((r) => r.label)).toEqual([
      '30-Oct-21',
      'PE2', // no recoverable date -- must not invent one
      '30-Dec-21',
    ]);
  });

  it('drops dateless periods from the to-scale timeline and reports how many were excluded', () => {
    const { rows, allRows, excludedPointCount } = buildChartRows(points, 'productionRatePerDay', 'timeline');

    expect(rows.map((r) => r.peNumber)).toEqual([1, 3]);
    expect(allRows).toHaveLength(3);
    expect(excludedPointCount).toBe(1);
    expect(rows.every((r) => r.timestamp !== null)).toBe(true);
  });

  it('positions timeline points by real date, so an unequal interval stays unequal', () => {
    const { rows } = buildChartRows(points, 'productionRatePerDay', 'timeline');

    const gapDays = (rows[1].timestamp! - rows[0].timestamp!) / (1000 * 60 * 60 * 24);
    expect(gapDays).toBe(61); // 30-Oct-21 -> 30-Dec-21, not a uniform one-slot step
  });

  it('falls back to the cutoff date when the period range is missing, and reports which date it used', () => {
    const [row] = buildChartRows([point({ peNumber: 9, cutoffDate: '2022-06-30' })], 'productionRatePerDay', 'date').rows;

    expect(row.label).toBe('30-Jun-22');
    expect(row.timestamp).not.toBeNull();
    expect(row.dateSource).toBe('cutoff_date');
  });

  it('reports period_end as the date source when a full period range exists', () => {
    const { rows } = buildChartRows(points, 'productionRatePerDay', 'date');

    expect(rows.map((r) => r.dateSource)).toEqual(['period_end', 'none', 'period_end']);
  });

  describe('a non-gap period that reported no amount of its own', () => {
    // PE2 is NOT a gap -- it exists and was validated -- but its earned man-hours could not be
    // derived (e.g. no man-hours-per-unit factor). Counting it as zero would fabricate a total.
    const withUnreported: MetricPointDto[] = [
      point({ peNumber: 1, periodEnd: '2021-10-30', earnedManHours: 100, earnedDollars: 1000 }),
      point({ peNumber: 2, periodEnd: '2021-11-30', earnedManHours: null, earnedDollars: 500 }),
      point({ peNumber: 3, periodEnd: '2021-12-30', earnedManHours: 50, earnedDollars: 250 }),
    ];

    it('is never counted as zero and plots no cumulative point of its own', () => {
      const { rows } = buildChartRows(withUnreported, 'cumulativeEarnedManHours', 'pe');

      expect(rows.map((r) => r.value)).toEqual([100, null, 150]);
    });

    it('marks every later cumulative figure as a lower bound with the count of omitted periods', () => {
      const { rows } = buildChartRows(withUnreported, 'cumulativeEarnedManHours', 'pe');

      expect(rows.map((r) => r.valueIsLowerBound)).toEqual([false, true, true]);
      expect(rows.map((r) => r.unknownContributionCount)).toEqual([0, 1, 1]);
    });

    it('tracks completeness per metric -- dollars stay complete when only man-hours are missing', () => {
      const { rows } = buildChartRows(withUnreported, 'cumulativeEarnedDollars', 'pe');

      expect(rows.map((r) => r.value)).toEqual([1000, 1500, 1750]);
      expect(rows.every((r) => !r.valueIsLowerBound)).toBe(true);
    });

    it('leaves non-cumulative metrics unflagged', () => {
      const { rows } = buildChartRows(withUnreported, 'productionRatePerDay', 'pe');

      expect(rows.every((r) => !r.valueIsLowerBound && r.unknownContributionCount === 0)).toBe(true);
    });
  });

  it('does not count a data gap as an unreported contribution', () => {
    const { rows } = buildChartRows(points, 'cumulativeEarnedManHours', 'pe');

    expect(rows.every((r) => !r.valueIsLowerBound)).toBe(true);
  });
});
