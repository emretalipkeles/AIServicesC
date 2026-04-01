import { BaseQuery } from '../../interfaces/IQueryBus';

export class GetTokenUsageByRunIdQuery extends BaseQuery {
  readonly type = 'GetTokenUsageByRunIdQuery' as const;
  constructor(
    public readonly runId: string,
    tenantId?: string
  ) {
    super(tenantId);
  }
}
