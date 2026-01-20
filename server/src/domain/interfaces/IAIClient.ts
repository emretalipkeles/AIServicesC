import type { AIMessage } from '../value-objects/AIMessage';
import type { ModelId } from '../value-objects/ModelId';

export interface ChatOptions {
  model: ModelId;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

export interface StreamChunk {
  type: 'content' | 'done' | 'error';
  content?: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface TestConnectionResult {
  success: boolean;
  authMethod: 'api-key' | 'iam';
  model: string;
  latencyMs: number;
  error?: string;
}

export interface StreamOptions {
  abortSignal?: AbortSignal;
}

export interface IAIClient {
  chat(options: ChatOptions): Promise<ChatResponse>;
  
  streamChat(
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void,
    streamOptions?: StreamOptions
  ): Promise<void>;
  
  testConnection(model: ModelId): Promise<TestConnectionResult>;
  
  getAuthMethod(): 'api-key' | 'iam';
}
