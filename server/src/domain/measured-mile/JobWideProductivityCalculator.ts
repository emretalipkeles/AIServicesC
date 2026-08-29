// Job-wide measured productivity factor (Tiers 1-2 of the labor model: total payroll job hours
// minus force-account hours = base-contract hours). This is computed once per project per period
// -- NOT per bid item, because neither payroll nor force-account rows carry a bid-item crosswalk
// (payroll has no cost code at all; force-account cost codes are PCO/changed-work codes, not the
// bid-item sub-activity codes used by POD). It is the "headline measured metric" the task spec
// calls for, shown as a project-level reference series alongside the per-item chart.
//
// Pure, no DB access -- see DrizzleMeasuredMileRepository for how the period buckets are built.

export interface JobWidePeriodInput {
  peNumber: number;
  cutoffDate: string | null;
  /** Sum of earned man-hours across every non-excluded direct-work bid item for this period. */
  totalEarnedManHours: number | null;
  /** Payroll hours charged to job 211 in this period, direct-craft trade rows only. */
  totalDirectPayrollHours: number | null;
  /** Force-account labor hours (changed/extra work) in this period. */
  forceAccountHours: number | null;
}

export interface JobWideProductivityPoint {
  peNumber: number;
  cutoffDate: string | null;
  totalEarnedManHours: number | null;
  totalDirectPayrollHours: number | null;
  forceAccountHours: number | null;
  baseContractHours: number | null;
  productivityFactor: number | null; // earned MH / base-contract MH; 1.0 = performing to budget
  disruptionIntensityPct: number | null; // forceAccountHours / totalDirectPayrollHours
}

export class JobWideProductivityCalculator {
  static compute(periods: JobWidePeriodInput[]): JobWideProductivityPoint[] {
    return [...periods]
      .sort((a, b) => a.peNumber - b.peNumber)
      .map((p) => {
        const baseContractHours =
          p.totalDirectPayrollHours !== null && p.forceAccountHours !== null
            ? p.totalDirectPayrollHours - p.forceAccountHours
            : null;

        const productivityFactor =
          p.totalEarnedManHours !== null && baseContractHours !== null && baseContractHours > 0
            ? p.totalEarnedManHours / baseContractHours
            : null;

        const disruptionIntensityPct =
          p.forceAccountHours !== null && p.totalDirectPayrollHours !== null && p.totalDirectPayrollHours > 0
            ? p.forceAccountHours / p.totalDirectPayrollHours
            : null;

        return {
          peNumber: p.peNumber,
          cutoffDate: p.cutoffDate,
          totalEarnedManHours: p.totalEarnedManHours,
          totalDirectPayrollHours: p.totalDirectPayrollHours,
          forceAccountHours: p.forceAccountHours,
          baseContractHours,
          productivityFactor,
          disruptionIntensityPct,
        };
      });
  }
}
