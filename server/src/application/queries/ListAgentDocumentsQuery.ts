import { BaseQuery } from '../interfaces/IQueryBus';

export class ListAgentDocumentsQuery extends BaseQuery {
  readonly type = 'ListAgentDocumentsQuery' as const;
  constructor(
    public readonly agentId: string,
    tenantId: string
  ) {
    super(tenantId);
  }
}
