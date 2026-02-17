import type { IChatToolExecutor, ChatToolCall, ChatToolResult, ChatToolDefinition } from '../../../domain/delay-analysis/interfaces/IChatToolExecutor';

export class CompositeChatToolExecutor implements IChatToolExecutor {
  private readonly toolMap: Map<string, IChatToolExecutor>;
  private readonly allDefinitions: ChatToolDefinition[];

  constructor(private readonly tools: ReadonlyArray<IChatToolExecutor>) {
    this.toolMap = new Map();
    this.allDefinitions = [];
    for (const tool of tools) {
      const defs = tool.getAvailableTools();
      for (const def of defs) {
        this.toolMap.set(def.name, tool);
        this.allDefinitions.push(def);
      }
    }
  }

  async execute(toolCall: ChatToolCall): Promise<ChatToolResult> {
    const tool = this.toolMap.get(toolCall.toolName);
    if (!tool) {
      return {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: null,
        error: `Unknown tool: ${toolCall.toolName}`
      };
    }
    return tool.execute(toolCall);
  }

  getAvailableTools(): ChatToolDefinition[] {
    return this.allDefinitions;
  }
}
