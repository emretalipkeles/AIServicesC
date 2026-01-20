import type { ModelName } from '../../domain/value-objects/ModelId';
import type { MessageRole } from '../../domain/value-objects/AIMessage';

export interface MessageDto {
  role: MessageRole;
  content: string;
}

export interface ChatRequestDto {
  model: ModelName;
  messages: MessageDto[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface ChatResponseDto {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  stopReason: string | null;
}

export interface TestConnectionRequestDto {
  model?: ModelName;
}

export interface TestConnectionResponseDto {
  success: boolean;
  authMethod: 'api-key' | 'iam';
  model: string;
  latencyMs: number;
  error?: string;
}

export interface StreamEventDto {
  type: 'content' | 'done' | 'error';
  content?: string;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
