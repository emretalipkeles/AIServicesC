import { BaseQuery } from '../../interfaces/IQueryBus';

export class GetCurrentUserQuery extends BaseQuery {
  readonly type = 'GetCurrentUserQuery' as const;
  constructor(
    public readonly userId: string,
  ) {
    super();
  }
}
