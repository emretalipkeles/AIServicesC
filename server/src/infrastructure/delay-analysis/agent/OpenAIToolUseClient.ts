import type { AzureOpenAI } from 'openai';
import type OpenAI from 'openai';
import type { IToolUseClient, ToolUseRequest, ToolUseResponse, ToolUseMessage, ToolCallBlock, TokenUsageInfo } from '../../../domain/delay-analysis/interfaces/IToolUseClient';
import { AIResponseTruncatedError } from '../../../domain/errors/DomainError';
import { ModelId } from '../../../domain/value-objects/ModelId';

// The Chat Completions endpoint rejects function tools combined with reasoning_effort
// on gpt-5.6-terra ("Function tools with reasoning_effort are not supported ... use
// /v1/responses instead"), so this client talks to the Responses API, which supports
// both together. Reasoning effort defaults to the model's default ('medium') but can
// be overridden per request (e.g. a user raising it to 'high' for one conversation).
const DEFAULT_REASONING_EFFORT = ModelId.defaultOpenAI().getReasoningEffort();

// Reasoning tokens are drawn from the same max_output_tokens budget as visible
// output/tool-call text, so this has to leave headroom beyond just the final answer.
const MAX_OUTPUT_TOKENS = 16000;

type ResponseInputItem = OpenAI.Responses.ResponseInputItem;

export class OpenAIToolUseClient implements IToolUseClient {
  private readonly openai: AzureOpenAI;
  private readonly model: string;

  constructor(client: AzureOpenAI, model: string = ModelId.defaultOpenAI().getValue()) {
    this.openai = client;
    this.model = model;
  }

  async chatWithTools(request: ToolUseRequest): Promise<ToolUseResponse> {
    const openaiTools: OpenAI.Responses.Tool[] = request.tools.map(tool => ({
      type: 'function' as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: false,
    }));

    const { instructions, input } = this.buildResponsesInput(request.messages);
    const reasoningEffort = request.reasoningEffort ?? DEFAULT_REASONING_EFFORT;

    // temperature is intentionally omitted: Azure rejects any non-default temperature
    // once reasoning is set on a reasoning-model deployment like gpt-5.6-terra.
    const stream = await this.openai.responses.create({
      model: this.model,
      instructions,
      input,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      stream: true,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      reasoning: { effort: reasoningEffort },
    });

    let accumulatedText = '';
    const toolCalls: ToolCallBlock[] = [];
    let tokenUsage: TokenUsageInfo | undefined;
    let incomplete = false;

    for await (const event of stream) {
      switch (event.type) {
        case 'response.output_text.delta': {
          accumulatedText += event.delta;
          if (request.onTextChunk) {
            request.onTextChunk(event.delta);
          }
          break;
        }
        case 'response.output_item.done': {
          const item = event.item;
          if (item.type === 'function_call') {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(item.arguments || '{}');
            } catch {
              console.warn(`[OpenAIToolUseClient] Failed to parse tool args for ${item.name}: ${item.arguments}`);
              args = {};
            }
            toolCalls.push({
              id: item.call_id,
              name: item.name,
              arguments: args,
            });
          }
          break;
        }
        case 'response.incomplete': {
          incomplete = event.response.incomplete_details?.reason === 'max_output_tokens';
          if (event.response.usage) {
            tokenUsage = {
              inputTokens: event.response.usage.input_tokens ?? 0,
              outputTokens: event.response.usage.output_tokens ?? 0,
              totalTokens: event.response.usage.total_tokens ?? 0,
            };
          }
          break;
        }
        case 'response.completed': {
          if (event.response.usage) {
            tokenUsage = {
              inputTokens: event.response.usage.input_tokens ?? 0,
              outputTokens: event.response.usage.output_tokens ?? 0,
              totalTokens: event.response.usage.total_tokens ?? 0,
            };
          }
          break;
        }
        case 'response.failed': {
          const errorMessage = event.response.error?.message || 'OpenAI Responses API request failed';
          throw new Error(errorMessage);
        }
        default:
          break;
      }
    }

    if (incomplete) {
      throw new AIResponseTruncatedError(`OpenAIToolUseClient.chatWithTools (${this.model})`, MAX_OUTPUT_TOKENS);
    }

    return {
      textContent: accumulatedText,
      toolCalls,
      stopReason: toolCalls.length > 0 ? 'tool_use' : 'end_turn',
      tokenUsage,
    };
  }

  // Converts the chat-completions-shaped conversation history used throughout the
  // agent loop into Responses API input items. The single leading system message
  // becomes `instructions`; assistant tool calls and tool results become
  // `function_call` / `function_call_output` items rather than message content.
  private buildResponsesInput(messages: ToolUseMessage[]): { instructions?: string; input: ResponseInputItem[] } {
    let instructions: string | undefined;
    const input: ResponseInputItem[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        instructions = instructions ? `${instructions}\n\n${msg.content ?? ''}` : (msg.content ?? '');
        continue;
      }

      if (msg.role === 'tool') {
        input.push({
          type: 'function_call_output',
          call_id: msg.tool_call_id!,
          output: msg.content || '',
        });
        continue;
      }

      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        if (msg.content) {
          input.push({ role: 'assistant', content: msg.content });
        }
        for (const tc of msg.tool_calls) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          });
        }
        continue;
      }

      input.push({ role: msg.role as 'user' | 'assistant', content: msg.content || '' });
    }

    return { instructions, input };
  }
}
