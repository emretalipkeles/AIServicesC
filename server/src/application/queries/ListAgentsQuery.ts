import { BaseQuery } from '../interfaces/IQueryBus';

export class ListAgentsQuery extends BaseQuery {
  constructor(tenantId: string) {
    super(tenantId);
  }
}
