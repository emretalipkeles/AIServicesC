import { BaseQuery } from '../../interfaces/IQueryBus';

export class ListDelayAnalysisProjectsQuery extends BaseQuery {
  readonly type = 'ListDelayAnalysisProjectsQuery' as const;
  constructor(tenantId: string) {
    super(tenantId);
  }
}
