import type { IFallbackResponseGenerator, FallbackContext } from '../../domain/interfaces/IFallbackResponseGenerator';
import type { IAIClient, StreamChunk } from '../../domain/interfaces/IAIClient';
import { ModelId } from '../../domain/value-objects/ModelId';
import { AIMessage } from '../../domain/value-objects/AIMessage';

const FALLBACK_SYSTEM_PROMPT = `You are AI Assistant for Construction Delay Interpreter, a specialized platform for interpreting contractor-caused delays in construction projects.

STRICT SCOPE GUARDRAILS:
You ONLY engage with questions related to:
- Construction delay analysis and delay events
- CPM schedule activities and their relationships to delays
- Project documents (IDRs, NCRs, Field Memos) and their contents
- Contractor-caused delays, weather delays, and other delay categories
- Schedule impacts, critical path analysis, and timeline issues
- Delay event patterns, causes, and responsible parties

You MUST politely decline questions about:
- Weather forecasts, news, sports, entertainment, or general knowledge
- Personal advice, opinions, or recommendations unrelated to construction delays
- Topics outside construction project delay analysis
- Any off-topic requests

When declining off-topic questions, respond with:
"I'm the Construction Delay Interpreter AI Assistant. I can only help with questions about construction delay events, schedule activities, and project timeline analysis. I can't help with [topic], but I'd be happy to assist with any questions about delays in your construction projects."

CONTEXT RULES (for on-topic conversations):
1. ALWAYS check the conversation history for context about what the user is referring to
2. If the conversation history shows a recent document upload, schedule upload, or analysis run, acknowledge that context naturally
3. Respond to casual comments (like "wow that was fast", "thanks!", "cool") by referencing the previous action appropriately
4. You can engage in natural conversational flow about recent on-topic actions

Keep responses concise and professional.`;

export class FallbackResponseGenerator implements IFallbackResponseGenerator {
  constructor(private aiClient: IAIClient) {}

  async generateStream(
    context: FallbackContext,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const agentList = context.availableAgents
      .map(a => `- **${a.name}**: ${a.description || 'Specialized assistant'}`)
      .join('\n');

    let conversationHistoryText = '';
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      conversationHistoryText = `\n\nConversation History (most recent last):\n${context.conversationHistory
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n')}\n`;
    }

    const userPrompt = `The user asked: "${context.userMessage}"
${conversationHistoryText}
I could not find a matching agent in my pool. Here are my available specialized agents:
${agentList}

Please respond to the user based on the conversation context. If the user is referencing something from the conversation history (like a recent package upload or previous action), acknowledge that context and respond appropriately. Be friendly and add a bit of personality!`;

    await this.aiClient.streamChat(
      {
        model: ModelId.gpt52(),
        systemPrompt: FALLBACK_SYSTEM_PROMPT,
        messages: [AIMessage.user(userPrompt)],
        maxTokens: 512,
        temperature: 0.7,
      },
      (chunk: StreamChunk) => {
        if (chunk.type === 'content' && chunk.content) {
          onChunk(chunk.content);
        }
      }
    );
  }
}
