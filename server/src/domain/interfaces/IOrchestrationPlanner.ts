import type { AgentSummary } from './IAgentDiscoveryService';
import type { ExecutionPlan } from '../value-objects/ExecutionPlan';

export interface PlanningContext {
  userMessage: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  availableAgents: AgentSummary[];
}

export interface IOrchestrationPlanner {
  createPlan(context: PlanningContext): Promise<ExecutionPlan | null>;
}
