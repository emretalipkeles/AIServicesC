import type { IAIService } from './IAIService';
import type { 
  ChatRequestDto, 
  ChatResponseDto, 
  TestConnectionRequestDto, 
  TestConnectionResponseDto,
  StreamEventDto 
} from '../dto/AIDto';
import type { IAIClient } from '../../domain/interfaces/IAIClient';
import { ModelId, SUPPORTED_MODELS, type ModelName } from '../../domain/value-objects/ModelId';
import { AIMessage } from '../../domain/value-objects/AIMessage';

export class AIService implements IAIService {
  constructor(private readonly client: IAIClient) {}

  async chat(request: ChatRequestDto): Promise<ChatResponseDto> {
    const model = ModelId.fromName(request.model);
    const messages = request.messages.map(m => new AIMessage({ role: m.role, content: m.content }));

    const response = await this.client.chat({
      model,
      messages,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      systemPrompt: request.systemPrompt,
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

  async streamChat(
    request: ChatRequestDto,
    onEvent: (event: StreamEventDto) => void
  ): Promise<void> {
    const model = ModelId.fromName(request.model);
    const messages = request.messages.map(m => new AIMessage({ role: m.role, content: m.content }));

    await this.client.streamChat(
      {
        model,
        messages,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
        systemPrompt: request.systemPrompt,
      },
      (chunk) => {
        if (chunk.type === 'content') {
          onEvent({ type: 'content', content: chunk.content });
        } else if (chunk.type === 'done') {
          onEvent({
            type: 'done',
            usage: chunk.inputTokens !== undefined ? {
              inputTokens: chunk.inputTokens,
              outputTokens: chunk.outputTokens ?? 0,
            } : undefined,
          });
        } else if (chunk.type === 'error') {
          onEvent({ type: 'error', error: chunk.error });
        }
      }
    );
  }

  async testConnection(request?: TestConnectionRequestDto): Promise<TestConnectionResponseDto> {
    const modelName = request?.model ?? 'claude-sonnet-4-5';
    const model = ModelId.fromName(modelName);

    const result = await this.client.testConnection(model);

    return {
      success: result.success,
      authMethod: result.authMethod,
      model: result.model,
      latencyMs: result.latencyMs,
      error: result.error,
    };
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getAvailableModels(): string[] {
    return Object.keys(SUPPORTED_MODELS) as ModelName[];
  }
}
