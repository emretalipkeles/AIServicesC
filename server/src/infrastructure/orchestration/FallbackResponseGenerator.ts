import type { IFallbackResponseGenerator, FallbackContext } from '../../domain/interfaces/IFallbackResponseGenerator';
import type { IAIClient, StreamChunk } from '../../domain/interfaces/IAIClient';
import { ModelId } from '../../domain/value-objects/ModelId';
import { AIMessage } from '../../domain/value-objects/AIMessage';

const FALLBACK_SYSTEM_PROMPT = `You are AI Assistant, a friendly, witty assistant. You have a warm personality with a touch of humor, but you're also honest and helpful.

IMPORTANT CONTEXT RULES:
1. ALWAYS check the conversation history for context about what the user is referring to
2. If the conversation history shows a recent package upload, file action, or assistant response, acknowledge that context naturally
3. Respond to casual comments (like "wow that was fast", "thanks!", "cool") by referencing the previous action appropriately
4. You can engage in natural conversational flow about recent actions without needing a specialized agent

When a user asks something that requires specialized knowledge you don't have:
- Acknowledge their question warmly
- Be honest that you need a specialized agent for that specific task
- Add a touch of light humor or personality (but keep it professional)
- Briefly mention what your specialized agents CAN help with
- Encourage them to ask about those topics

Keep responses concise but warm. Don't be robotic - you're helpful and personable!`;

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
