import type { AzureOpenAI } from 'openai';
import type { 
  IAIClient, 
  ChatOptions, 
  ChatResponse, 
  StreamChunk, 
  StreamOptions,
  TestConnectionResult 
} from '../../domain/interfaces/IAIClient';
import type { ModelId } from '../../domain/value-objects/ModelId';

const DEFAULT_MAX_TOKENS = 4096;

export class OpenAIResponsesClient implements IAIClient {
  private readonly client: AzureOpenAI;

  constructor(client: AzureOpenAI) {
    this.client = client;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const messages = this.buildMessages(options);

    const response = await this.client.chat.completions.create({
      model: options.model.getValue(),
      messages,
      max_completion_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    });

    const choice = response.choices[0];

    return {
      content: choice?.message?.content ?? '',
      model: options.model.getValue(),
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      stopReason: choice?.finish_reason ?? null,
    };
  }

  async streamChat(
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void,
    streamOptions?: StreamOptions
  ): Promise<void> {
    const messages = this.buildMessages(options);

    try {
      const stream = await this.client.chat.completions.create({
        model: options.model.getValue(),
        messages,
        max_completion_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        if (streamOptions?.abortSignal?.aborted) {
          break;
        }

        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          onChunk({
            type: 'content',
            content: delta.content,
          });
        }

        if (chunk.usage) {
          onChunk({
            type: 'done',
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown Azure OpenAI error';
      onChunk({
        type: 'error',
        error: errorMessage,
      });
    }
  }

  async testConnection(model: ModelId): Promise<TestConnectionResult> {
    const startTime = Date.now();

    try {
      await this.client.chat.completions.create({
        model: model.getValue(),
        messages: [{ role: 'user', content: 'Hello' }],
        max_completion_tokens: 10,
      });

      return {
        success: true,
        authMethod: 'api-key',
        model: model.getValue(),
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        authMethod: 'api-key',
        model: model.getValue(),
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getAuthMethod(): 'api-key' | 'iam' {
    return 'api-key';
  }

  private buildMessages(options: ChatOptions): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    for (const message of options.messages) {
      messages.push({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      });
    }

    return messages;
  }
}
