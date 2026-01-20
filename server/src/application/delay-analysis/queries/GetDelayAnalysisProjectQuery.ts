import { BaseQuery } from '../../interfaces/IQueryBus';

export class GetDelayAnalysisProjectQuery extends BaseQuery {
  constructor(
    tenantId: string,
    public readonly projectId: string
  ) {
    super(tenantId);
  }
}
