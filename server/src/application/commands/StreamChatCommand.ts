import { BaseCommand } from '../interfaces/ICommandBus';
import type { ModelName } from '../../domain/value-objects/ModelId';
import type { MessageRole } from '../../domain/value-objects/AIMessage';

export interface StreamChatMessageInput {
  role: MessageRole;
  content: string;
}

export class StreamChatCommand extends BaseCommand {
  constructor(
    public readonly model: ModelName,
    public readonly messages: StreamChatMessageInput[],
    public readonly maxTokens?: number,
    public readonly temperature?: number,
    public readonly systemPrompt?: string,
    tenantId?: string
  ) {
    super(tenantId);
  }
}
