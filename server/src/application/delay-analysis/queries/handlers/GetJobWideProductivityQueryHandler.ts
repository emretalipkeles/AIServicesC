import type { GetJobWideProductivityQuery } from '../GetJobWideProductivityQuery';
import type { IMeasuredMileRepository } from '../../../../domain/delay-analysis/repositories/IMeasuredMileRepository';
import { JobWideProductivityCalculator, type JobWideProductivityPoint } from '../../../../domain/measured-mile/JobWideProductivityCalculator';

export interface JobWideProductivityProvenance {
  tablesRead: Array<{ table: string; rowCount: number; note: string }>;
  formulas: Record<string, string>;
  measuredVsProxyTier: string;
  limitation: string;
}

export interface GetJobWideProductivityResult {
  points: JobWideProductivityPoint[];
  provenance: JobWideProductivityProvenance;
}

export class GetJobWideProductivityQueryHandler {
  constructor(private readonly repository: IMeasuredMileRepository) {}

  async execute(query: GetJobWideProductivityQuery): Promise<GetJobWideProductivityResult> {
    const eligibleItems = await this.repository.getEligibleBidItems(query.projectId, query.tenantId);
    const eligibleItemNos = new Set(eligibleItems.map((i) => i.itemNo));

    const inputs = await this.repository.getJobWideProductivityInputs(query.projectId, query.tenantId, eligibleItemNos);
    const points = JobWideProductivityCalculator.compute(inputs);

    const provenance: JobWideProductivityProvenance = {
      tablesRead: [
        { table: 'bid_item_progress_estimates', rowCount: inputs.length, note: `earned man-hours summed across ${eligibleItemNos.size} direct-work bid items, direct quantityThisEstimate values only` },
        { table: 'payroll_job_labor_entries', rowCount: inputs.length, note: 'direct-craft hours (tradeCategory=direct), non-quarantined, bucketed by pay date into each period' },
        { table: 'force_account_transactions', rowCount: inputs.length, note: 'FORCE_ACCOUNT_LABOR hours, non-quarantined, bucketed by transaction date into each period' },
      ],
      formulas: {
        baseContractHours: 'totalDirectPayrollHours − forceAccountHours (payroll includes both base-contract and force-account work; subtracting FA isolates the base-contract denominator)',
        productivityFactor: 'totalEarnedManHours ÷ baseContractHours (1.0 = performing exactly to the budgeted rate; below 1.0 = took more hours than budgeted)',
        disruptionIntensityPct: 'forceAccountHours ÷ totalDirectPayrollHours (share of the workforce diverted into changed/extra work that period)',
      },
      measuredVsProxyTier: 'measured (Tier 1/2) -- payroll and force-account hours are both measured, not proxied. Job-wide only: neither table carries a bid-item crosswalk, so this factor cannot be split per item.',
      limitation: 'Earned man-hours here use only directly-reported quantityThisEstimate values (no to-date-delta fallback), unlike the per-item series. This is a secondary reference metric; the per-item chart is authoritative for a specific bid item.',
    };

    return { points, provenance };
  }
}
