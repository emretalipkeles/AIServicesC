import type { IAgentLoop, AgentLoopInput, AgentLoopResult, AgentLoopEvent, AgentLoopTokenUsage } from '../../../domain/delay-analysis/interfaces/IAgentLoop';
import type { IToolRegistry } from '../../../domain/delay-analysis/interfaces/IToolRegistry';
import type { IToolUseClient, ToolUseMessage } from '../../../domain/delay-analysis/interfaces/IToolUseClient';
import type { ToolExecutionContext } from '../../../domain/delay-analysis/interfaces/ITool';

const MAX_ITERATIONS = 15;

export class ReactAgentLoop implements IAgentLoop {
  constructor(
    private readonly toolRegistry: IToolRegistry,
    private readonly toolUseClient: IToolUseClient,
    private readonly modelName: string = 'gpt-5.2'
  ) {}

  async run(
    input: AgentLoopInput,
    onEvent: (event: AgentLoopEvent) => void
  ): Promise<AgentLoopResult> {
    const toolsUsed: string[] = [];
    let iterations = 0;
    const cumulativeTokens: AgentLoopTokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      apiCalls: 0,
    };

    onEvent({ type: 'loop_started', message: 'Starting analysis...' });

    const messages: ToolUseMessage[] = [
      { role: 'system', content: input.systemPrompt },
    ];

    if (input.conversationHistory) {
      for (const msg of input.conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: input.userMessage });

    const toolDefinitions = this.toolRegistry.getDefinitions();
    const executionContext: ToolExecutionContext = {
      tenantId: input.tenantId,
      projectId: input.projectId,
    };

    try {
      while (iterations < MAX_ITERATIONS) {
        iterations++;

        onEvent({
          type: 'thinking',
          message: iterations === 1 ? 'Analyzing your question...' : `Continuing analysis...`,
          iterationCount: iterations,
          iteration: iterations,
        });

        console.log(`[ReactAgentLoop] Iteration ${iterations}/${MAX_ITERATIONS}`);

        const response = await this.toolUseClient.chatWithTools({
          messages,
          tools: toolDefinitions,
          onTextChunk: (chunk) => {
            onEvent({ type: 'response_chunk', content: chunk });
          },
        });

        if (response.tokenUsage) {
          cumulativeTokens.inputTokens += response.tokenUsage.inputTokens;
          cumulativeTokens.outputTokens += response.tokenUsage.outputTokens;
          cumulativeTokens.totalTokens += response.tokenUsage.totalTokens;
          cumulativeTokens.apiCalls++;
        }

        if (response.stopReason === 'end_turn' || response.toolCalls.length === 0) {
          const finalResponse = response.textContent;

          onEvent({
            type: 'response_complete',
            response: finalResponse,
            toolsUsed,
            iterationCount: iterations,
          });

          onEvent({
            type: 'loop_completed',
            message: `Completed in ${iterations} iteration(s)`,
            toolsUsed,
            iterationCount: iterations,
          });

          console.log(`[ReactAgentLoop] Completed in ${iterations} iterations, tools used: ${toolsUsed.join(', ') || 'none'}, tokens: ${cumulativeTokens.totalTokens} (${cumulativeTokens.apiCalls} API calls)`);

          return {
            success: true,
            response: finalResponse,
            toolsUsed,
            iterationCount: iterations,
            tokenUsage: cumulativeTokens,
            model: this.modelName,
          };
        }

        messages.push({
          role: 'assistant',
          content: response.textContent || null,
          tool_calls: response.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        });

        for (const toolCall of response.toolCalls) {
          const tool = this.toolRegistry.getByName(toolCall.name);

          onEvent({
            type: 'tool_invocation',
            toolName: toolCall.name,
            toolArgs: toolCall.arguments,
            message: `Using tool: ${toolCall.name}`,
            iteration: iterations,
          });

          if (!tool) {
            const errorMsg = `Unknown tool: ${toolCall.name}`;
            console.warn(`[ReactAgentLoop] ${errorMsg}`);

            onEvent({
              type: 'tool_result',
              toolName: toolCall.name,
              toolError: errorMsg,
            });

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: errorMsg }),
            });
            continue;
          }

          if (!toolsUsed.includes(toolCall.name)) {
            toolsUsed.push(toolCall.name);
          }

          console.log(`[ReactAgentLoop] Executing tool: ${toolCall.name} with args:`, JSON.stringify(toolCall.arguments).substring(0, 200));

          try {
            const result = await tool.execute(toolCall.arguments, executionContext);

            onEvent({
              type: 'tool_result',
              toolName: toolCall.name,
              toolResult: result.success ? 'Success' : 'Failed',
              toolError: result.error,
            });

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result.success ? result.output : { error: result.error }),
            });

            console.log(`[ReactAgentLoop] Tool ${toolCall.name} ${result.success ? 'succeeded' : 'failed'}`);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[ReactAgentLoop] Tool ${toolCall.name} threw exception:`, errorMsg);

            onEvent({
              type: 'tool_result',
              toolName: toolCall.name,
              toolError: errorMsg,
            });

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: errorMsg }),
            });
          }
        }
      }

      console.warn(`[ReactAgentLoop] Reached max iterations (${MAX_ITERATIONS})`);

      onEvent({
        type: 'loop_failed',
        error: `Reached maximum iterations (${MAX_ITERATIONS})`,
        iterationCount: iterations,
      });

      return {
        success: false,
        response: 'I reached my analysis limit. Please try a more specific question.',
        toolsUsed,
        iterationCount: iterations,
        tokenUsage: cumulativeTokens,
        model: this.modelName,
        error: `Max iterations reached (${MAX_ITERATIONS})`,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ReactAgentLoop] Fatal error:`, errorMsg);

      onEvent({
        type: 'loop_failed',
        error: errorMsg,
        iterationCount: iterations,
      });

      return {
        success: false,
        response: 'I encountered an error while analyzing. Please try again.',
        toolsUsed,
        iterationCount: iterations,
        tokenUsage: cumulativeTokens,
        model: this.modelName,
        error: errorMsg,
      };
    }
  }
}
