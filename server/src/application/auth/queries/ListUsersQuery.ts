import { BaseQuery } from '../../interfaces/IQueryBus';

export class ListUsersQuery extends BaseQuery {
  readonly type = 'ListUsersQuery' as const;
  constructor() {
    super();
  }
}
