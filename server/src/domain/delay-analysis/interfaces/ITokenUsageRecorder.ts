export interface TokenUsageRecord {
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  metadata?: Record<string, unknown>;
}

export type TokenUsageCallback = (usage: TokenUsageRecord) => void | Promise<void>;
