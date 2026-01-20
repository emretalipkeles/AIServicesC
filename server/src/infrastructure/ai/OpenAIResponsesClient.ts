import OpenAI from 'openai';
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
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const input = this.buildInput(options);
    const reasoningEffort = options.model.getReasoningEffort();

    const response = await this.client.responses.create({
      model: options.model.getValue(),
      input,
      reasoning: { effort: reasoningEffort },
      max_output_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    });

    return {
      content: response.output_text ?? '',
      model: options.model.getValue(),
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      stopReason: response.status ?? null,
    };
  }

  async streamChat(
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void,
    streamOptions?: StreamOptions
  ): Promise<void> {
    const input = this.buildInput(options);
    const reasoningEffort = options.model.getReasoningEffort();

    try {
      const stream = await this.client.responses.create({
        model: options.model.getValue(),
        input,
        reasoning: { effort: reasoningEffort },
        max_output_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        stream: true,
      });

      for await (const event of stream) {
        if (streamOptions?.abortSignal?.aborted) {
          break;
        }

        if (event.type === 'response.output_text.delta') {
          onChunk({
            type: 'content',
            content: event.delta ?? '',
          });
        } else if (event.type === 'response.completed') {
          onChunk({
            type: 'done',
            inputTokens: event.response?.usage?.input_tokens ?? 0,
            outputTokens: event.response?.usage?.output_tokens ?? 0,
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown OpenAI error';
      onChunk({
        type: 'error',
        error: errorMessage,
      });
    }
  }

  async testConnection(model: ModelId): Promise<TestConnectionResult> {
    const startTime = Date.now();

    try {
      const response = await this.client.responses.create({
        model: model.getValue(),
        input: 'Hello',
        max_output_tokens: 10,
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

  private buildInput(options: ChatOptions): string {
    let input = '';

    if (options.systemPrompt) {
      input += `System: ${options.systemPrompt}\n\n`;
    }

    for (const message of options.messages) {
      const role = message.role === 'user' ? 'User' : 'Assistant';
      input += `${role}: ${message.content}\n\n`;
    }

    return input.trim();
  }
}
