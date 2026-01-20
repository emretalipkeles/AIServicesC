import type { ExecutionStep } from '../value-objects/ExecutionPlan';

export interface AgentExecutionResultMetadata {
  packageUpdated?: boolean;
  packageId?: string;
}

export interface AgentExecutionResult {
  agentId: string;
  agentName: string;
  response: string;
  success: boolean;
  error?: string;
  metadata?: AgentExecutionResultMetadata;
}

export interface IAgentExecutor {
  execute(
    step: ExecutionStep,
    tenantId: string,
    previousResults?: Map<string, AgentExecutionResult>,
    conversationId?: string
  ): Promise<AgentExecutionResult>;

  executeStream(
    step: ExecutionStep,
    tenantId: string,
    onChunk: (chunk: string) => void,
    previousResults?: Map<string, AgentExecutionResult>,
    conversationId?: string
  ): Promise<AgentExecutionResult>;
}
