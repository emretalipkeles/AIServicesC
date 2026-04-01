import { BaseCommand } from '../interfaces/ICommandBus';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class ChatWithAgentCommand extends BaseCommand {
  readonly type = 'ChatWithAgentCommand' as const;
  constructor(
    public readonly agentId: string,
    tenantId: string,
    public readonly messages: ChatMessage[],
    public readonly maxTokens: number = 4096,
    public readonly temperature: number = 0.7
  ) {
    super(tenantId);
  }
}
