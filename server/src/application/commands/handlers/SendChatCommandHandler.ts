import type { ICommandHandler } from '../../interfaces/ICommandBus';
import type { SendChatCommand } from '../SendChatCommand';
import type { ChatResponseDto } from '../../dto/AIDto';
import type { IAIClient } from '../../../domain/interfaces/IAIClient';
import { ModelId } from '../../../domain/value-objects/ModelId';
import { AIMessage } from '../../../domain/value-objects/AIMessage';

export interface IAIClientProvider {
  getClient(tenantId?: string): IAIClient | null;
}

export class SendChatCommandHandler implements ICommandHandler<SendChatCommand, ChatResponseDto> {
  constructor(private readonly clientProvider: IAIClientProvider) {}

  async handle(command: SendChatCommand): Promise<ChatResponseDto> {
    const client = this.clientProvider.getClient(command.tenantId);
    
    if (!client) {
      throw new Error('AI client not configured for tenant');
    }

    const model = ModelId.fromName(command.model);
    const messages = command.messages.map(m => new AIMessage({ role: m.role, content: m.content }));

    const response = await client.chat({
      model,
      messages,
      maxTokens: command.maxTokens,
      temperature: command.temperature,
      systemPrompt: command.systemPrompt,
    });

    return {
      content: response.content,
      model: response.model,
      usage: {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        totalTokens: response.inputTokens + response.outputTokens,
      },
      stopReason: response.stopReason,
    };
  }
}
