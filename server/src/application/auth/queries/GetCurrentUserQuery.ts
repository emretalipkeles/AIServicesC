import { BaseQuery } from '../../interfaces/IQueryBus';

export class GetCurrentUserQuery extends BaseQuery {
  constructor(
    public readonly userId: string,
  ) {
    super();
  }
}
