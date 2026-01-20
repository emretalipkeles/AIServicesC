import type { IResponseSynthesizer, SynthesisContext } from '../../domain/interfaces/IResponseSynthesizer';
import type { IAIClient } from '../../domain/interfaces/IAIClient';
import { ModelId } from '../../domain/value-objects/ModelId';
import { AIMessage } from '../../domain/value-objects/AIMessage';

const SYNTHESIS_SYSTEM_PROMPT = `You are Phix AI, a helpful assistant that synthesizes information from multiple specialized agents into a coherent, unified response.

Your task:
1. Combine the responses from different agents into a single, well-organized answer
2. Resolve any conflicts or inconsistencies between agent responses
3. Present the information in a clear, natural way that directly addresses the user's original question
4. Do NOT mention that you are combining responses from multiple agents - just provide the unified answer naturally
5. If an agent encountered an error, work around it gracefully using information from other agents
6. If conversation history is provided, maintain continuity and reference previous context when relevant
7. For follow-up questions, build on previous responses rather than repeating information

Be conversational, helpful, and concise.`;

export class ResponseSynthesizer implements IResponseSynthesizer {
  constructor(private aiClient: IAIClient) {}

  async synthesize(context: SynthesisContext): Promise<string> {
    if (context.agentResults.length === 1 && context.agentResults[0].success) {
      return context.agentResults[0].response;
    }

    const agentResponsesText = context.agentResults
      .filter(r => r.success)
      .map(r => `Response from ${r.agentName}:\n${r.response}`)
      .join('\n\n---\n\n');

    if (!agentResponsesText) {
      return "I apologize, but I wasn't able to get useful responses from the specialized agents. Please try rephrasing your question.";
    }

    let conversationHistoryText = '';
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      conversationHistoryText = `\nConversation History (for context):\n${context.conversationHistory
        .slice(-6)
        .map(m => `${m.role === 'user' ? 'User' : 'Phix AI'}: ${m.content.substring(0, 500)}${m.content.length > 500 ? '...' : ''}`)
        .join('\n\n')}\n\n`;
    }

    const userPrompt = `${conversationHistoryText}Original user question: ${context.originalQuestion}

Agent responses to synthesize:
${agentResponsesText}

Please provide a unified, coherent response that addresses the user's question. Consider the conversation history if provided.`;

    const response = await this.aiClient.chat({
      model: ModelId.gpt52(),
      systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
      messages: [AIMessage.user(userPrompt)],
      maxTokens: 2048,
      temperature: 0.7,
    });

    return response.content;
  }

  async synthesizeStream(
    context: SynthesisContext,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    if (context.agentResults.length === 1 && context.agentResults[0].success) {
      onChunk(context.agentResults[0].response);
      return;
    }

    const agentResponsesText = context.agentResults
      .filter(r => r.success)
      .map(r => `Response from ${r.agentName}:\n${r.response}`)
      .join('\n\n---\n\n');

    if (!agentResponsesText) {
      onChunk("I apologize, but I wasn't able to get useful responses from the specialized agents. Please try rephrasing your question.");
      return;
    }

    let conversationHistoryText = '';
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      conversationHistoryText = `\nConversation History (for context):\n${context.conversationHistory
        .slice(-6)
        .map(m => `${m.role === 'user' ? 'User' : 'Phix AI'}: ${m.content.substring(0, 500)}${m.content.length > 500 ? '...' : ''}`)
        .join('\n\n')}\n\n`;
    }

    const userPrompt = `${conversationHistoryText}Original user question: ${context.originalQuestion}

Agent responses to synthesize:
${agentResponsesText}

Please provide a unified, coherent response that addresses the user's question. Consider the conversation history if provided.`;

    await this.aiClient.streamChat(
      {
        model: ModelId.gpt52(),
        systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
        messages: [AIMessage.user(userPrompt)],
        maxTokens: 2048,
        temperature: 0.7,
      },
      (streamChunk) => {
        if (streamChunk.type === 'content' && streamChunk.content) {
          onChunk(streamChunk.content);
        }
      }
    );
  }
}
