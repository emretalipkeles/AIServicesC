import { BaseQuery } from '../interfaces/IQueryBus';
import type { ModelName } from '../../domain/value-objects/ModelId';

export class TestConnectionQuery extends BaseQuery {
  readonly type = 'TestConnectionQuery' as const;
  constructor(
    public readonly model: ModelName = 'claude-sonnet-4-5',
    tenantId?: string
  ) {
    super(tenantId);
  }
}
