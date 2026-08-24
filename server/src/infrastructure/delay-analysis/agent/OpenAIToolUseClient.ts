import type { AzureOpenAI } from 'openai';
import type OpenAI from 'openai';
import type { IToolUseClient, ToolUseRequest, ToolUseResponse, ToolCallBlock, TokenUsageInfo } from '../../../domain/delay-analysis/interfaces/IToolUseClient';
import { AIResponseTruncatedError } from '../../../domain/errors/DomainError';
import { ModelId } from '../../../domain/value-objects/ModelId';

// This client always talks to the gpt-5.4 reasoning deployment (agent verification
// loop), so its reasoning effort is fixed at the model's default ('medium').
const REASONING_EFFORT = ModelId.gpt54().getReasoningEffort();

// Reasoning tokens are drawn from the same max_completion_tokens budget as visible
// output/tool-call text, so this has to leave headroom beyond just the final answer.
const MAX_COMPLETION_TOKENS = 16000;

export class OpenAIToolUseClient implements IToolUseClient {
  private readonly openai: AzureOpenAI;
  private readonly model: string;

  constructor(client: AzureOpenAI, model: string = 'gpt-5.4') {
    this.openai = client;
    this.model = model;
  }

  async chatWithTools(request: ToolUseRequest): Promise<ToolUseResponse> {
    const openaiTools: OpenAI.ChatCompletionTool[] = request.tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    const openaiMessages: OpenAI.ChatCompletionMessageParam[] = request.messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          tool_call_id: msg.tool_call_id!,
          content: msg.content || '',
        };
      }
      if (msg.role === 'assistant' && msg.tool_calls) {
        return {
          role: 'assistant' as const,
          content: msg.content || null,
          tool_calls: msg.tool_calls,
        };
      }
      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content || '',
      };
    });

    // temperature is intentionally omitted: Azure rejects any non-default temperature
    // once reasoning_effort is set on a reasoning-model deployment like gpt-5.4.
    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      reasoning_effort: REASONING_EFFORT,
    });

    let accumulatedText = '';
    const toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];
    let currentToolCall: { id: string; function: { name: string; arguments: string } } | null = null;
    let tokenUsage: TokenUsageInfo | undefined;
    let finishReason: string | null = null;

    for await (const chunk of response) {
      const choice = chunk.choices[0];
      const delta = choice?.delta;
      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      }

      if (delta?.content) {
        accumulatedText += delta.content;
        if (request.onTextChunk) {
          request.onTextChunk(delta.content);
        }
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            if (currentToolCall) {
              toolCalls.push(currentToolCall);
            }
            currentToolCall = {
              id: tc.id,
              function: { name: tc.function?.name || '', arguments: '' },
            };
          }
          if (currentToolCall && tc.function?.arguments) {
            currentToolCall.function.arguments += tc.function.arguments;
          }
        }
      }

      if (chunk.usage) {
        tokenUsage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
          totalTokens: chunk.usage.total_tokens ?? 0,
        };
      }
    }

    if (finishReason === 'length') {
      throw new AIResponseTruncatedError(`OpenAIToolUseClient.chatWithTools (${this.model})`, MAX_COMPLETION_TOKENS);
    }

    if (currentToolCall) {
      toolCalls.push(currentToolCall);
    }

    const parsedToolCalls: ToolCallBlock[] = toolCalls.map(tc => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        console.warn(`[OpenAIToolUseClient] Failed to parse tool args for ${tc.function.name}: ${tc.function.arguments}`);
        args = {};
      }
      return {
        id: tc.id,
        name: tc.function.name,
        arguments: args,
      };
    });

    const hasToolCalls = parsedToolCalls.length > 0;

    return {
      textContent: accumulatedText,
      toolCalls: parsedToolCalls,
      stopReason: hasToolCalls ? 'tool_use' : 'end_turn',
      tokenUsage,
    };
  }
}
