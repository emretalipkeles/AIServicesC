export interface AgentLoopInput {
  projectId: string;
  tenantId: string;
  userMessage: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  systemPrompt: string;
}

export interface AgentLoopTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  apiCalls: number;
}

export interface AgentLoopResult {
  success: boolean;
  response: string;
  toolsUsed: string[];
  iterationCount: number;
  tokenUsage?: AgentLoopTokenUsage;
  model?: string;
  error?: string;
}

export type AgentLoopEventType =
  | 'loop_started'
  | 'thinking'
  | 'tool_invocation'
  | 'tool_result'
  | 'response_chunk'
  | 'response_complete'
  | 'loop_completed'
  | 'loop_failed';

export interface AgentLoopEvent {
  type: AgentLoopEventType;
  message?: string;
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  toolError?: string;
  iterationCount?: number;
  toolsUsed?: string[];
  response?: string;
  error?: string;
}

export interface IAgentLoop {
  run(
    input: AgentLoopInput,
    onEvent: (event: AgentLoopEvent) => void
  ): Promise<AgentLoopResult>;
}
