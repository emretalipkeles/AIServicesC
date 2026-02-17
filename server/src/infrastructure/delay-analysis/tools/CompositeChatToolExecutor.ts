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
      console.warn(`[CompositeChatToolExecutor] Unknown tool requested: "${toolCall.toolName}" (available: ${Array.from(this.toolMap.keys()).join(', ')})`);
      return {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: null,
        error: `Unknown tool: ${toolCall.toolName}`
      };
    }

    const argsJson = JSON.stringify(toolCall.arguments);
    const argsSummary = argsJson.length > 200 ? argsJson.substring(0, 200) + '...' : argsJson;
    console.log(`[CompositeChatToolExecutor] Dispatching tool: "${toolCall.toolName}" with args: ${argsSummary}`);
    const startTime = Date.now();

    try {
      const result = await tool.execute(toolCall);
      const elapsed = Date.now() - startTime;

      if (result.error) {
        console.warn(`[CompositeChatToolExecutor] Tool "${toolCall.toolName}" returned error (${elapsed}ms): ${result.error}`);
      } else {
        const resultSummary = Array.isArray(result.result) ? `${result.result.length} items` : typeof result.result;
        console.log(`[CompositeChatToolExecutor] Tool "${toolCall.toolName}" completed (${elapsed}ms): ${resultSummary}`);
      }

      return result;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`[CompositeChatToolExecutor] Tool "${toolCall.toolName}" threw exception (${elapsed}ms):`, error);
      return {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: null,
        error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  getAvailableTools(): ChatToolDefinition[] {
    return this.allDefinitions;
  }
}
