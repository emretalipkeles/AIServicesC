import type { AgentSummary } from './IAgentDiscoveryService';

export interface FallbackContext {
  userMessage: string;
  availableAgents: AgentSummary[];
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface IFallbackResponseGenerator {
  generateStream(
    context: FallbackContext,
    onChunk: (chunk: string) => void
  ): Promise<void>;
}
