import type { IPretCommandHandler, IPretCommandRegistry } from '../../../domain/pret';

export class PretCommandRegistry implements IPretCommandRegistry {
  private handlers: Map<string, IPretCommandHandler<unknown, unknown>> = new Map();

  register<TArgs, TResult>(handler: IPretCommandHandler<TArgs, TResult>): void {
    if (this.handlers.has(handler.commandType)) {
      console.warn(`[PretCommandRegistry] Overwriting handler for command: ${handler.commandType}`);
    }
    this.handlers.set(handler.commandType, handler as IPretCommandHandler<unknown, unknown>);
    console.log(`[PretCommandRegistry] Registered handler for: ${handler.commandType}`);
  }

  getHandler<TArgs, TResult>(commandType: string): IPretCommandHandler<TArgs, TResult> | undefined {
    return this.handlers.get(commandType) as IPretCommandHandler<TArgs, TResult> | undefined;
  }

  getAvailableCommands(): string[] {
    return Array.from(this.handlers.keys());
  }

  hasHandler(commandType: string): boolean {
    return this.handlers.has(commandType);
  }
}
