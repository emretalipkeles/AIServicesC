import type { AIMessage } from '../value-objects/AIMessage';
import type { ModelId } from '../value-objects/ModelId';

export interface ChatOptions {
  model: ModelId;
  messages: AIMessage[];
  maxTokens?: number;
  /**
   * Sampling temperature. Always honored by the Bedrock clients.
   *
   * On the OpenAI path, the gpt-5.6-terra deployment rejects any non-default
   * temperature outright (confirmed live: this happens even with no reasoning_effort
   * set at all, so it is not conditional on reasoning_effort as gpt-5.4 was).
   * OpenAIResponsesClient never forwards a literal temperature value to this
   * deployment — instead it treats an explicit `temperature` here as a request for
   * deterministic, literal output (e.g. structured extraction/matching) and maps it
   * to `reasoning_effort: 'none'`, which is confirmed to spend zero reasoning tokens.
   * Omit temperature to get reasoning_effort driven by ModelId.getReasoningEffort(),
   * which is the default for every other OpenAI call site.
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
