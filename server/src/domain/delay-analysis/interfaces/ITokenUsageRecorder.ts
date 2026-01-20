export interface TokenUsageRecord {
  runId: string;
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  metadata?: Record<string, unknown>;
}

export type TokenUsageCallback = (usage: TokenUsageRecord) => void | Promise<void>;

export interface TokenUsageContext {
  projectId: string;
  runId: string;
}

export type TokenUsageCallbackFactory = (context: TokenUsageContext) => TokenUsageCallback;
