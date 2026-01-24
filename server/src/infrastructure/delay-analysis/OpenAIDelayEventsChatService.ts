import type { 
  IDelayEventsChatService, 
  DelayEventsChatRequest, 
  DelayEventsChatResponse 
} from '../../domain/delay-analysis/interfaces/IDelayEventsChatService';
import type { IAIClient } from '../../domain/interfaces/IAIClient';
import type { ContractorDelayEvent } from '../../domain/delay-analysis/entities/ContractorDelayEvent';
import { AIMessage } from '../../domain/value-objects/AIMessage';
import { ModelId } from '../../domain/value-objects/ModelId';

const SYSTEM_PROMPT = `You are a specialized construction delay analysis assistant. Your ONLY purpose is to answer questions about the delay events data provided to you.

## CRITICAL RULES - YOU MUST FOLLOW THESE ABSOLUTELY:

1. **ONLY answer questions about the delay events data provided below.** This includes:
   - Summarizing delay events
   - Analyzing patterns in delays
   - Identifying categories or trends
   - Comparing delay durations
   - Explaining specific delay events
   - Calculating statistics about the delays
   - Finding delays by date, category, or description

2. **REFUSE to answer ANY question that is not directly about the delay events data.** This includes but is not limited to:
   - General knowledge questions
   - Weather forecasts
   - Construction advice unrelated to the specific delays
   - Personal questions
   - Math problems unrelated to the data
   - Code or programming questions
   - Politics, news, entertainment
   - ANY topic not directly about the delay events listed below

3. **When refusing, always be polite and redirect.** Use this exact format:
   "I can only answer questions about the delay events in this project. Is there something specific about the delays you'd like to know? For example, I can help you:
   - Summarize the delay events
   - Find delays by category or date
   - Analyze delay patterns and trends
   - Calculate total impact hours"

4. **Base ALL answers strictly on the data provided.** Never make up information. If the data doesn't contain the answer, say so clearly.

5. **Format responses clearly.** Use bullet points and numbers when listing multiple items.

## DELAY EVENTS DATA:
`;

function formatDelayEventsForContext(events: ContractorDelayEvent[]): string {
  if (events.length === 0) {
    return "\n[No delay events have been recorded for this project yet.]\n";
  }

  const eventSummaries = events.map((event, index) => {
    const parts = [
      `${index + 1}. ${event.eventDescription}`,
      `   - Category: ${formatCategory(event.eventCategory)}`,
      `   - Date: ${event.eventStartDate ? new Date(event.eventStartDate).toLocaleDateString() : 'Not specified'}`,
      `   - Duration: ${event.impactDurationHours ? `${event.impactDurationHours} hours` : 'Not specified'}`,
      `   - Status: ${event.verificationStatus}`,
    ];
    
    if (event.cpmActivityId) {
      parts.push(`   - Matched Activity: ${event.cpmActivityId} - ${event.cpmActivityDescription || 'N/A'}`);
    }
    if (event.matchConfidence !== null) {
      parts.push(`   - Match Confidence: ${event.matchConfidence}%`);
    }
    if (event.sourceReference) {
      parts.push(`   - Source: ${event.sourceReference}`);
    }
    
    return parts.join('\n');
  });

  return `\nTotal Events: ${events.length}\n\n${eventSummaries.join('\n\n')}`;
}

function formatCategory(category: string | null): string {
  if (!category) return 'Unknown';
  return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export class OpenAIDelayEventsChatService implements IDelayEventsChatService {
  constructor(private readonly aiClient: IAIClient) {}

  async chat(request: DelayEventsChatRequest): Promise<DelayEventsChatResponse> {
    const eventsContext = formatDelayEventsForContext(request.delayEvents);
    const fullSystemPrompt = SYSTEM_PROMPT + eventsContext;

    const messages: AIMessage[] = [];
    
    for (const msg of request.conversationHistory) {
      if (msg.role === 'user') {
        messages.push(AIMessage.user(msg.content));
      } else {
        messages.push(AIMessage.assistant(msg.content));
      }
    }
    
    messages.push(AIMessage.user(request.userMessage));

    try {
      const response = await this.aiClient.chat({
        model: ModelId.gpt52(),
        messages,
        systemPrompt: fullSystemPrompt,
        maxTokens: 2000,
        temperature: 0.3,
      });

      const isRefusal = this.detectRefusal(response.content);

      return {
        response: response.content,
        isRefusal,
      };
    } catch (error) {
      console.error('Error in delay events chat:', error);
      return {
        response: "I apologize, but I encountered an issue processing your request. Please try again.",
        isRefusal: false,
      };
    }
  }

  private detectRefusal(response: string): boolean {
    const refusalPatterns = [
      'can only answer questions about',
      'only help with questions about the delay',
      'cannot help with that',
      'outside the scope',
      'not related to the delay events',
    ];
    
    const lowerResponse = response.toLowerCase();
    return refusalPatterns.some(pattern => lowerResponse.includes(pattern));
  }
}
