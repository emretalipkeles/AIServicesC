import type { ToolDefinition } from './ITool';

export interface ToolUseMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface ToolUseRequest {
  messages: ToolUseMessage[];
  tools: ToolDefinition[];
  onTextChunk?: (chunk: string) => void;
}

export interface ToolCallBlock {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolUseResponse {
  textContent: string;
  toolCalls: ToolCallBlock[];
  stopReason: 'end_turn' | 'tool_use';
}

export interface IToolUseClient {
  chatWithTools(request: ToolUseRequest): Promise<ToolUseResponse>;
}
