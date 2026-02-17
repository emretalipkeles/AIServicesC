import OpenAI from 'openai';
import type { IToolUseClient, ToolUseRequest, ToolUseResponse, ToolCallBlock } from '../../../domain/delay-analysis/interfaces/IToolUseClient';

export class OpenAIToolUseClient implements IToolUseClient {
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string = 'gpt-4.1') {
    this.openai = new OpenAI({ apiKey });
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

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      stream: true,
      max_completion_tokens: 4000,
      temperature: 0.3,
    });

    let accumulatedText = '';
    const toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];
    let currentToolCall: { id: string; function: { name: string; arguments: string } } | null = null;

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta;

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
    };
  }
}
