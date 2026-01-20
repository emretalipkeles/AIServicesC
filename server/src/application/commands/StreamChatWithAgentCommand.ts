import { BaseCommand } from '../interfaces/ICommandBus';

export interface StreamChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class StreamChatWithAgentCommand extends BaseCommand {
  constructor(
    public readonly agentId: string,
    tenantId: string,
    public readonly messages: StreamChatMessage[],
    public readonly maxTokens: number = 4096,
    public readonly temperature: number = 0.7
  ) {
    super(tenantId);
  }
}
