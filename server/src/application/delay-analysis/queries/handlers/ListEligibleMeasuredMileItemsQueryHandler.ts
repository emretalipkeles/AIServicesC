import type { ListEligibleMeasuredMileItemsQuery } from '../ListEligibleMeasuredMileItemsQuery';
import type { IMeasuredMileRepository, EligibleBidItem } from '../../../../domain/delay-analysis/repositories/IMeasuredMileRepository';

export class ListEligibleMeasuredMileItemsQueryHandler {
  constructor(private readonly repository: IMeasuredMileRepository) {}

  async execute(query: ListEligibleMeasuredMileItemsQuery): Promise<EligibleBidItem[]> {
    const items = await this.repository.getEligibleBidItems(query.projectId, query.tenantId);
    // Rank by budgeted man-hours (falls back to contract dollars) so the selector defaults to
    // the bid items that matter most to the job's labor productivity story.
    return items.sort((a, b) => {
      const aRank = a.budgetedManHours ?? a.contractDollars ?? 0;
      const bRank = b.budgetedManHours ?? b.contractDollars ?? 0;
      return bRank - aRank;
    });
  }
}
