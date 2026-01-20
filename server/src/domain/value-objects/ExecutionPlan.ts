export type ExecutionStrategy = 'parallel' | 'sequential' | 'single';

export interface ExecutionStep {
  agentId: string;
  agentName: string;
  refinedPrompt: string;
  dependsOn?: string[];
}

export interface ExecutionPlan {
  strategy: ExecutionStrategy;
  steps: ExecutionStep[];
  reasoning: string;
}
