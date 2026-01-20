import type { AgentExecutionResult } from './IAgentExecutor';

export interface SynthesisContext {
  originalQuestion: string;
  agentResults: AgentExecutionResult[];
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface IResponseSynthesizer {
  synthesize(context: SynthesisContext): Promise<string>;

  synthesizeStream(
    context: SynthesisContext,
    onChunk: (chunk: string) => void
  ): Promise<void>;
}
