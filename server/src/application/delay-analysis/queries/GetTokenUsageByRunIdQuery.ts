import { BaseQuery } from '../../interfaces/IQueryBus';

export class GetTokenUsageByRunIdQuery extends BaseQuery {
  constructor(
    public readonly runId: string,
    tenantId?: string
  ) {
    super(tenantId);
  }
}
