import { BaseQuery } from '../interfaces/IQueryBus';

export class GetAgentQuery extends BaseQuery {
  constructor(
    public readonly id: string,
    tenantId: string
  ) {
    super(tenantId);
  }
}
