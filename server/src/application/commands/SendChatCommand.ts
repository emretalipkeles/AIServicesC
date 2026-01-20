import { BaseCommand } from '../interfaces/ICommandBus';
import type { ModelName } from '../../domain/value-objects/ModelId';
import type { MessageRole } from '../../domain/value-objects/AIMessage';

export interface ChatMessageInput {
  role: MessageRole;
  content: string;
}

export class SendChatCommand extends BaseCommand {
  constructor(
    public readonly model: ModelName,
    public readonly messages: ChatMessageInput[],
    public readonly maxTokens?: number,
    public readonly temperature?: number,
    public readonly systemPrompt?: string,
    tenantId?: string
  ) {
    super(tenantId);
  }
}
