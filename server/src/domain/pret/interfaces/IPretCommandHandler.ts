import type { IPretCommand } from './IPretCommand';
import type { IPretCommandResult } from './IPretCommandResult';

export interface IPretCommandHandler<
  TArgs = unknown,
  TResult = unknown
> {
  readonly commandType: string;
  
  handle(command: IPretCommand<TArgs>): Promise<IPretCommandResult<TResult>>;
}

export interface IPretCommandRegistry {
  register<TArgs, TResult>(handler: IPretCommandHandler<TArgs, TResult>): void;
  
  getHandler<TArgs, TResult>(commandType: string): IPretCommandHandler<TArgs, TResult> | undefined;
  
  getAvailableCommands(): string[];
  
  hasHandler(commandType: string): boolean;
}
