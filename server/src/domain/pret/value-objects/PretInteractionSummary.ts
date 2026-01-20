import type { PretCommandType } from '../interfaces/IPretCommand';

export interface PretInteractionSummaryProps {
  commandType: PretCommandType;
  userMessage: string;
  response: string;
  dataSnapshot: Record<string, unknown>;
  timestamp: Date;
}

export class PretInteractionSummary {
  readonly commandType: PretCommandType;
  readonly userMessage: string;
  readonly response: string;
  readonly dataSnapshot: Record<string, unknown>;
  readonly timestamp: Date;

  private constructor(props: PretInteractionSummaryProps) {
    this.commandType = props.commandType;
    this.userMessage = props.userMessage;
    this.response = props.response;
    this.dataSnapshot = Object.freeze({ ...props.dataSnapshot });
    this.timestamp = props.timestamp;
  }

  static create(props: PretInteractionSummaryProps): PretInteractionSummary {
    return new PretInteractionSummary(props);
  }

  toCompactString(): string {
    return `[${this.commandType}] User: "${this.userMessage}" -> Response summary: ${this.response.substring(0, 200)}${this.response.length > 200 ? '...' : ''}`;
  }

  toMemoryEntry(): string {
    const dataKeys = Object.keys(this.dataSnapshot);
    const dataSummary = dataKeys.length > 0 
      ? `Data included: ${dataKeys.join(', ')}` 
      : 'No data returned';
    
    return `Command: ${this.commandType}\nUser asked: "${this.userMessage}"\n${dataSummary}\nResponse: ${this.response}`;
  }
}
