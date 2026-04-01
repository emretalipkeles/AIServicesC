import { randomUUID } from 'node:crypto';

export interface Command {
  readonly type: string;
  readonly commandId: string;
  readonly tenantId?: string;
}

export abstract class BaseCommand implements Command {
  abstract readonly type: string;
  readonly commandId: string;

  constructor(public readonly tenantId?: string) {
    this.commandId = randomUUID();
  }
}

export interface ICommandHandler<TCommand extends Command, TResult = void> {
  handle(command: TCommand): Promise<TResult>;
}

export interface ICommandBus {
  execute<TCommand extends Command, TResult = void>(command: TCommand): Promise<TResult>;
  register<TCommand extends Command, TResult = void>(
    commandType: string,
    handler: ICommandHandler<TCommand, TResult>
  ): void;
}
