import type { Query, IQueryBus, IQueryHandler } from '../../application/interfaces/IQueryBus';

export class InMemoryQueryBus implements IQueryBus {
  private handlers: Map<string, IQueryHandler<any, any>> = new Map();

  async execute<TQuery extends Query, TResult>(query: TQuery): Promise<TResult> {
    const queryType = query.constructor.name;
    const handler = this.handlers.get(queryType);
    
    if (!handler) {
      throw new Error(`No handler registered for query: ${queryType}`);
    }

    return handler.handle(query);
  }

  register<TQuery extends Query, TResult>(
    queryType: string,
    handler: IQueryHandler<TQuery, TResult>
  ): void {
    if (this.handlers.has(queryType)) {
      throw new Error(`Handler already registered for query: ${queryType}`);
    }
    this.handlers.set(queryType, handler);
  }

  unregister(queryType: string): void {
    this.handlers.delete(queryType);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const queryBus = new InMemoryQueryBus();
