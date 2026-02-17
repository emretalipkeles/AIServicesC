export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      items?: { type: string };
    }>;
    required: string[];
  };
}

export interface ToolExecutionContext {
  tenantId: string;
  projectId: string;
}

export interface ToolExecutionResult {
  success: boolean;
  output: unknown;
  error?: string;
}

export interface ITool {
  readonly definition: ToolDefinition;
  execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolExecutionResult>;
}
