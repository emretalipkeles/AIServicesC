import type { 
  IDelayEventsChatService, 
  DelayEventsChatRequest, 
  DelayEventsChatResponse 
} from '../../domain/delay-analysis/interfaces/IDelayEventsChatService';
import type { IAIClient } from '../../domain/interfaces/IAIClient';
import type { ContractorDelayEvent } from '../../domain/delay-analysis/entities/ContractorDelayEvent';
import type { DocumentContentSummary } from '../../domain/delay-analysis/interfaces/IDocumentContentProvider';
import { AIMessage } from '../../domain/value-objects/AIMessage';
import { ModelId } from '../../domain/value-objects/ModelId';

const SYSTEM_PROMPT = `You are a specialized construction delay analysis assistant. Your purpose is to answer questions about the delay events data and help users understand how delay durations were interpreted from source documents.

## CRITICAL RULES - YOU MUST FOLLOW THESE:

1. **ONLY answer questions about the delay events data provided below.** This includes:
   - Summarizing delay events
   - Analyzing patterns in delays
   - Identifying categories or trends
   - Comparing delay durations
   - Explaining specific delay events
   - Calculating statistics about the delays
   - Finding delays by date, category, or description
   - **EXPLAINING HOW DURATIONS WERE ESTIMATED** (see Duration Methodology below)

2. **REFUSE to answer ANY question that is not directly about the delay events data.** This includes but is not limited to:
   - General knowledge questions
   - Weather forecasts
   - Construction advice unrelated to the specific delays
   - Personal questions
   - Math problems unrelated to the data
   - Code or programming questions
   - Politics, news, entertainment
   - ANY topic not directly about the delay events listed below

3. **When refusing, always be polite and redirect.** Say:
   "I can only answer questions about the delay events in this project. I can help you:
   - Summarize the delay events
   - Find delays by category or date
   - Analyze delay patterns and trends
   - Calculate total impact hours
   - **Explain how durations were estimated from the source documents**"

4. **Base ALL answers strictly on the data provided.** Never make up information. If the data doesn't contain the answer, say so clearly.

5. **Format responses clearly.** Use bullet points and numbers when listing multiple items.

## DURATION ESTIMATION METHODOLOGY

When users ask about how a delay duration was determined, explain using this methodology:

### For Inspector Daily Reports (IDRs):
IDRs are daily field observations. Durations are estimated by interpreting the narrative:
- **Explicit mentions**: If the text says "crew arrived 2 hours late" → 2 hours extracted directly
- **Estimated from context**: If the text describes an incident without explicit duration (e.g., "equipment breakdown requiring repairs"), the duration is estimated based on:
  - Type of incident (equipment failure, crew shortage, material delay)
  - Typical resolution times for similar issues
  - Scope described in the narrative
- **CODE_CIE tags**: These flag contractor-initiated events but don't always include duration
- **Confidence**: IDR durations have moderate confidence (around 60%) because they require interpretation

### For Non-Conformance Reports (NCRs):
NCRs document quality failures requiring rework. Duration = definite delay:
- **Rework scope**: Duration is estimated from the corrective action required
  - Removal time: How long to tear out failed work
  - Redo time: How long to reinstall correctly
  - Re-inspection time: Time for QC verification
- **Work type matters**: Concrete removal takes longer than minor adjustments
- **Confidence**: NCR durations have higher confidence (around 85%) because rework = definite delay

### For Field Memos:
- General delay indicators with lower confidence
- Duration estimated from the memo's description of the issue

When explaining a specific delay's duration, reference the source document content if available.

## DELAY EVENTS DATA:
`;

function formatDelayEventsForContext(
  events: ContractorDelayEvent[],
  sourceDocuments?: Map<string, DocumentContentSummary>
): string {
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
      parts.push(`   - Source Reference: ${event.sourceReference}`);
    }
    if (event.extractedFromCode) {
      parts.push(`   - Extracted From: ${event.extractedFromCode}`);
    }

    if (event.sourceDocumentId && sourceDocuments) {
      const doc = sourceDocuments.get(event.sourceDocumentId);
      if (doc) {
        parts.push(`   - Source Document: ${doc.filename} (${doc.documentType.toUpperCase()})`);
        if (doc.reportDate) {
          parts.push(`   - Document Date: ${new Date(doc.reportDate).toLocaleDateString()}`);
        }
      }
    }
    
    return parts.join('\n');
  });

  return `\nTotal Events: ${events.length}\n\n${eventSummaries.join('\n\n')}`;
}

function formatDocumentContentsSection(
  events: ContractorDelayEvent[],
  sourceDocuments?: Map<string, DocumentContentSummary>
): string {
  if (!sourceDocuments || sourceDocuments.size === 0) {
    return '';
  }

  const referencedDocIds = new Set(
    events
      .filter(e => e.sourceDocumentId)
      .map(e => e.sourceDocumentId!)
  );

  if (referencedDocIds.size === 0) {
    return '';
  }

  const docContents: string[] = [];
  
  for (const docId of Array.from(referencedDocIds)) {
    const doc = sourceDocuments.get(docId);
    if (doc && doc.fullContent) {
      const truncatedContent = doc.fullContent.length > 3000 
        ? doc.fullContent.substring(0, 3000) + '...[truncated]'
        : doc.fullContent;
      
      docContents.push(
        `### ${doc.filename} (${doc.documentType.toUpperCase()})` +
        (doc.reportDate ? ` - ${new Date(doc.reportDate).toLocaleDateString()}` : '') +
        `\n${truncatedContent}`
      );
    }
  }

  if (docContents.length === 0) {
    return '';
  }

  return `\n\n## SOURCE DOCUMENT CONTENTS:\nUse these to explain how durations and events were extracted:\n\n${docContents.join('\n\n---\n\n')}`;
}

function formatCategory(category: string | null): string {
  if (!category) return 'Unknown';
  return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export class OpenAIDelayEventsChatService implements IDelayEventsChatService {
  constructor(private readonly aiClient: IAIClient) {}

  async chat(request: DelayEventsChatRequest): Promise<DelayEventsChatResponse> {
    const eventsContext = formatDelayEventsForContext(
      request.delayEvents,
      request.sourceDocuments
    );
    const documentContents = formatDocumentContentsSection(
      request.delayEvents,
      request.sourceDocuments
    );
    const fullSystemPrompt = SYSTEM_PROMPT + eventsContext + documentContents;

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
