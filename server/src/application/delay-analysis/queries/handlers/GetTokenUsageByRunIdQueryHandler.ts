import type { IQueryHandler } from '../../../interfaces/IQueryBus';
import type { GetTokenUsageByRunIdQuery } from '../GetTokenUsageByRunIdQuery';
import type { IAITokenUsageRepository, RunTokenUsageSummary } from '../../../../domain/delay-analysis/repositories/IAITokenUsageRepository';

export class GetTokenUsageByRunIdQueryHandler 
  implements IQueryHandler<GetTokenUsageByRunIdQuery, RunTokenUsageSummary | null> {
  
  constructor(private readonly repository: IAITokenUsageRepository) {}

  async handle(query: GetTokenUsageByRunIdQuery): Promise<RunTokenUsageSummary | null> {
    return this.repository.getRunSummary(query.runId);
  }
}
