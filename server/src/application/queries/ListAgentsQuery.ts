import { BaseQuery } from '../interfaces/IQueryBus';

export class ListAgentsQuery extends BaseQuery {
  readonly type = 'ListAgentsQuery' as const;
  constructor(tenantId: string) {
    super(tenantId);
  }
}
