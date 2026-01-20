import { BaseQuery } from '../interfaces/IQueryBus';

export class ListAgentDocumentsQuery extends BaseQuery {
  constructor(
    public readonly agentId: string,
    tenantId: string
  ) {
    super(tenantId);
  }
}
