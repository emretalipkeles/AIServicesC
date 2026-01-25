export interface ChatToolCall {
  toolName: string;
  toolCallId: string;
  arguments: Record<string, unknown>;
}

export interface ChatToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
  error?: string;
}

export interface IChatToolExecutor {
  execute(toolCall: ChatToolCall): Promise<ChatToolResult>;
  getAvailableTools(): ChatToolDefinition[];
}

export interface ChatToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
    }>;
    required: string[];
  };
}
