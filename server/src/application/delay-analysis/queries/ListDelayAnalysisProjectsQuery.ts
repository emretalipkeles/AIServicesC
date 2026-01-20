import { BaseQuery } from '../../interfaces/IQueryBus';

export class ListDelayAnalysisProjectsQuery extends BaseQuery {
  constructor(tenantId: string) {
    super(tenantId);
  }
}
