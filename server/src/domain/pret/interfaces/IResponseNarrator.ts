import type { IPretCommandResult } from './IPretCommandResult';
import type { PretCommandType } from './IPretCommand';

export interface NarratorContext {
  commandType: PretCommandType;
  result: IPretCommandResult<unknown>;
  userMessage: string;
  wasSuccessful: boolean;
}

export interface IResponseNarrator {
  narrate(context: NarratorContext): Promise<string>;
}
