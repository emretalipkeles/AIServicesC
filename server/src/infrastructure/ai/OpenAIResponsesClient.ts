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
import { AIResponseTruncatedError } from '../../domain/errors/DomainError';

// gpt-5.4 is a reasoning model: reasoning tokens are drawn from the same
// max_completion_tokens budget as visible output, so the ceiling has to leave
// headroom for reasoning overhead on top of whatever content is expected.
const DEFAULT_MAX_TOKENS = 16000;

export class OpenAIResponsesClient implements IAIClient {
  private readonly client: AzureOpenAI;

  constructor(client: AzureOpenAI) {
    this.client = client;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const messages = this.buildMessages(options);

    const deploymentName = options.model.getAzureDeploymentName();
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

    const response = await this.client.chat.completions.create({
      model: deploymentName,
      messages,
      max_completion_tokens: maxTokens,
      ...this.reasoningOrTemperature(options),
    });

    const choice = response.choices[0];

    if (choice?.finish_reason === 'length') {
      throw new AIResponseTruncatedError(`OpenAIResponsesClient.chat (${deploymentName})`, maxTokens);
    }

    return {
      content: choice?.message?.content ?? '',
      model: deploymentName,
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
      const deploymentName = options.model.getAzureDeploymentName();
      const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

      const stream = await this.client.chat.completions.create({
        model: deploymentName,
        messages,
        max_completion_tokens: maxTokens,
        ...this.reasoningOrTemperature(options),
        stream: true,
        stream_options: { include_usage: true },
      });

      let finishReason: string | null = null;

      for await (const chunk of stream) {
        if (streamOptions?.abortSignal?.aborted) {
          break;
        }

        const choice = chunk.choices[0];
        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }

        const delta = choice?.delta;
        if (delta?.content) {
          onChunk({
            type: 'content',
            content: delta.content,
          });
        }

        if (chunk.usage) {
          if (finishReason === 'length') {
            onChunk({
              type: 'error',
              error: new AIResponseTruncatedError(`OpenAIResponsesClient.streamChat (${deploymentName})`, maxTokens).message,
            });
            return;
          }

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

    const deploymentName = model.getAzureDeploymentName();

    try {
      await this.client.chat.completions.create({
        model: deploymentName,
        messages: [{ role: 'user', content: 'Hello' }],
        max_completion_tokens: 10,
        reasoning_effort: model.getReasoningEffort(),
      });
      // testConnection always exercises the reasoning_effort path deliberately: it
      // verifies the deployment answers a reasoning-mode request, which is the
      // default posture for every OpenAI call site that doesn't opt out via temperature.

      return {
        success: true,
        authMethod: 'api-key',
        model: deploymentName,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        authMethod: 'api-key',
        model: deploymentName,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getAuthMethod(): 'api-key' | 'iam' {
    return 'api-key';
  }

  // reasoning_effort and temperature are mutually exclusive on this reasoning-model
  // deployment: Azure rejects any non-default temperature once reasoning_effort is
  // set. Callers that need deterministic output (e.g. structured extraction/matching)
  // can pass an explicit temperature to opt out of reasoning_effort for that call;
  // everyone else gets reasoning_effort (driven by ModelId) by default.
  private reasoningOrTemperature(
    options: ChatOptions
  ): { temperature: number } | { reasoning_effort: 'medium' | 'high' } {
    if (options.temperature !== undefined) {
      return { temperature: options.temperature };
    }
    return { reasoning_effort: options.model.getReasoningEffort() };
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
