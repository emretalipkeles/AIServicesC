import type { AIMessage } from '../value-objects/AIMessage';
import type { ModelId } from '../value-objects/ModelId';

export interface ChatOptions {
  model: ModelId;
  messages: AIMessage[];
  maxTokens?: number;
  /**
   * Sampling temperature. Always honored by the Bedrock clients.
   *
   * On the OpenAI path, reasoning_effort and temperature are mutually exclusive:
   * Azure rejects any non-default temperature once reasoning_effort is set on a
   * reasoning-model deployment. OpenAIResponsesClient resolves this by treating an
   * explicit temperature as an opt-out of reasoning_effort for that call — use this
   * only where deterministic, literal output matters more than reasoning depth (e.g.
   * structured extraction/matching). Omit temperature to get reasoning_effort
   * (driven by ModelId.getReasoningEffort()), which is the default for every other
   * OpenAI call site.
   */
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
