import type { AITokenUsage } from '../entities/AITokenUsage';

export interface TokenUsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  operationBreakdown: Record<string, {
    count: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>;
}

export interface IAITokenUsageRepository {
  save(usage: AITokenUsage): Promise<void>;
  
  findByProjectId(projectId: string): Promise<AITokenUsage[]>;
  
  getProjectSummary(projectId: string): Promise<TokenUsageSummary>;
  
  getTotalUsage(): Promise<TokenUsageSummary>;
}
