import { BaseQuery } from '../../interfaces/IQueryBus';

export class GetDelayAnalysisProjectQuery extends BaseQuery {
  readonly type = 'GetDelayAnalysisProjectQuery' as const;
  constructor(
    tenantId: string,
    public readonly projectId: string
  ) {
    super(tenantId);
  }
}
