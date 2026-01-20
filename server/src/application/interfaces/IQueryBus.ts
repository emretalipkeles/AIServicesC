import { randomUUID } from 'node:crypto';

export interface Query {
  readonly queryId: string;
  readonly tenantId?: string;
}

export abstract class BaseQuery implements Query {
  readonly queryId: string;

  constructor(public readonly tenantId?: string) {
    this.queryId = randomUUID();
  }
}

export interface IQueryHandler<TQuery extends Query, TResult> {
  handle(query: TQuery): Promise<TResult>;
}

export interface IQueryBus {
  execute<TQuery extends Query, TResult>(query: TQuery): Promise<TResult>;
  register<TQuery extends Query, TResult>(
    queryType: string,
    handler: IQueryHandler<TQuery, TResult>
  ): void;
}
