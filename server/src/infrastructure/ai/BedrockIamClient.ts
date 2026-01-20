import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import type { 
  IAIClient, 
  ChatOptions, 
  ChatResponse, 
  StreamChunk, 
  StreamOptions,
  TestConnectionResult 
} from '../../domain/interfaces/IAIClient';
import type { ModelId } from '../../domain/value-objects/ModelId';
import { DEFAULT_MAX_TOKENS } from './bedrock-types';

export interface BedrockIamConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export class BedrockIamClient implements IAIClient {
  private readonly client: AnthropicBedrock;
  private readonly region: string;

  constructor(config: BedrockIamConfig) {
    this.region = config.region;
    
    this.client = new AnthropicBedrock({
      awsRegion: config.region,
      awsAccessKey: config.accessKeyId,
      awsSecretKey: config.secretAccessKey,
      awsSessionToken: config.sessionToken,
    });
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: options.model.getValue(),
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: options.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      system: options.systemPrompt,
      temperature: options.temperature,
    });

    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('');

    return {
      content,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason,
    };
  }

  async streamChat(
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void,
    streamOptions?: StreamOptions
  ): Promise<void> {
    let stream: ReturnType<typeof this.client.messages.stream> | null = null;
    let abortHandler: (() => void) | null = null;

    try {
      stream = this.client.messages.stream({
        model: options.model.getValue(),
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: options.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        system: options.systemPrompt,
        temperature: options.temperature,
      });

      if (streamOptions?.abortSignal) {
        abortHandler = () => {
          if (stream) {
            stream.controller.abort();
          }
        };
        streamOptions.abortSignal.addEventListener('abort', abortHandler);
      }

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const event of stream) {
        if (streamOptions?.abortSignal?.aborted) {
          return;
        }

        if (event.type === 'content_block_delta') {
          const delta = event.delta as { type: string; text?: string };
          if (delta.type === 'text_delta' && delta.text) {
            onChunk({ type: 'content', content: delta.text });
          }
        }

        if (event.type === 'message_start') {
          const message = (event as any).message;
          if (message?.usage) {
            inputTokens = message.usage.input_tokens;
          }
        }

        if (event.type === 'message_delta') {
          const usage = (event as any).usage;
          if (usage) {
            outputTokens = usage.output_tokens;
          }
        }
      }

      onChunk({ type: 'done', inputTokens, outputTokens });
    } catch (error) {
      if (streamOptions?.abortSignal?.aborted) {
        return;
      }
      onChunk({
        type: 'error',
        error: error instanceof Error ? error.message : 'Stream error',
      });
    } finally {
      if (abortHandler && streamOptions?.abortSignal) {
        streamOptions.abortSignal.removeEventListener('abort', abortHandler);
      }
    }
  }

  async testConnection(model: ModelId): Promise<TestConnectionResult> {
    const startTime = Date.now();

    try {
      const response = await this.client.messages.create({
        model: model.getValue(),
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });

      return {
        success: true,
        authMethod: 'iam',
        model: response.model,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        authMethod: 'iam',
        model: model.getValue(),
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getAuthMethod(): 'api-key' | 'iam' {
    return 'iam';
  }
}
