import type { Command, ICommandBus, ICommandHandler } from '../../application/interfaces/ICommandBus';

export class InMemoryCommandBus implements ICommandBus {
  private handlers: Map<string, ICommandHandler<any, any>> = new Map();

  async execute<TCommand extends Command, TResult = void>(command: TCommand): Promise<TResult> {
    const commandType = command.type;
    const handler = this.handlers.get(commandType);
    
    if (!handler) {
      throw new Error(`No handler registered for command: ${commandType}`);
    }

    return handler.handle(command);
  }

  register<TCommand extends Command, TResult = void>(
    commandType: string,
    handler: ICommandHandler<TCommand, TResult>
  ): void {
    if (this.handlers.has(commandType)) {
      throw new Error(`Handler already registered for command: ${commandType}`);
    }
    this.handlers.set(commandType, handler);
  }

  unregister(commandType: string): void {
    this.handlers.delete(commandType);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const commandBus = new InMemoryCommandBus();
