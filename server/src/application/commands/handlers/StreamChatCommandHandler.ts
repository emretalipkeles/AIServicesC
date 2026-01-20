import type { StreamChatCommand } from '../StreamChatCommand';
import type { IAIClient, StreamChunk } from '../../../domain/interfaces/IAIClient';
import { ModelId } from '../../../domain/value-objects/ModelId';
import { AIMessage } from '../../../domain/value-objects/AIMessage';

export interface IAIClientProvider {
  getClient(tenantId?: string): IAIClient | null;
}

export interface StreamHandlerOptions {
  abortSignal?: AbortSignal;
}

export class StreamChatCommandHandler {
  constructor(private readonly clientProvider: IAIClientProvider) {}

  async handleStream(
    command: StreamChatCommand,
    onChunk: (chunk: StreamChunk) => void,
    options?: StreamHandlerOptions
  ): Promise<void> {
    const client = this.clientProvider.getClient(command.tenantId);
    
    if (!client) {
      onChunk({ type: 'error', error: 'AI client not configured for tenant' });
      return;
    }

    const model = ModelId.fromName(command.model);
    const messages = command.messages.map(m => new AIMessage({ role: m.role, content: m.content }));

    await client.streamChat(
      {
        model,
        messages,
        maxTokens: command.maxTokens,
        temperature: command.temperature,
        systemPrompt: command.systemPrompt,
      },
      onChunk,
      { abortSignal: options?.abortSignal }
    );
  }
}
