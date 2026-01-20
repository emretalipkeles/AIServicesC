import type { PretCommandType } from '../interfaces/IPretCommand';

export interface ClassifiedIntentProps {
  commandType: PretCommandType | null;
  args: Record<string, unknown>;
  confidence: number;
  rawMessage: string;
  reasoning?: string;
}

export class ClassifiedIntent {
  readonly commandType: PretCommandType | null;
  readonly args: Record<string, unknown>;
  readonly confidence: number;
  readonly rawMessage: string;
  readonly reasoning?: string;

  private constructor(props: ClassifiedIntentProps) {
    this.commandType = props.commandType;
    this.args = Object.freeze({ ...props.args });
    this.confidence = props.confidence;
    this.rawMessage = props.rawMessage;
    this.reasoning = props.reasoning;
  }

  static create(props: ClassifiedIntentProps): ClassifiedIntent {
    return new ClassifiedIntent(props);
  }

  static noMatch(rawMessage: string): ClassifiedIntent {
    return new ClassifiedIntent({
      commandType: null,
      args: {},
      confidence: 0,
      rawMessage
    });
  }

  isMatched(): boolean {
    return this.commandType !== null && this.confidence >= 0.75;
  }

  hasRequiredArgs(requiredArgs: string[]): boolean {
    return requiredArgs.every(arg => 
      this.args[arg] !== undefined && this.args[arg] !== null && this.args[arg] !== ''
    );
  }
}
