import { BaseQuery } from '../interfaces/IQueryBus';

export class GetAgentQuery extends BaseQuery {
  readonly type = 'GetAgentQuery' as const;
  constructor(
    public readonly id: string,
    tenantId: string
  ) {
    super(tenantId);
  }
}
