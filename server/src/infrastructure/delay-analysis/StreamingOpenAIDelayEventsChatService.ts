import type { 
  IStreamingDelayEventsChatService, 
  StreamingDelayEventsChatRequest,
  StreamingChatEvent 
} from '../../domain/delay-analysis/interfaces/IStreamingDelayEventsChatService';
import type { IChatToolExecutor, ChatToolCall } from '../../domain/delay-analysis/interfaces/IChatToolExecutor';
import type { ContractorDelayEvent } from '../../domain/delay-analysis/entities/ContractorDelayEvent';
import type { DocumentContentSummary } from '../../domain/delay-analysis/interfaces/IDocumentContentProvider';
import OpenAI from 'openai';
import { ContractorDelayTrainingGuide } from './../../domain/delay-analysis/config/ContractorDelayTrainingGuide';
import { DelayKnowledgePromptBuilder } from './DelayKnowledgePromptBuilder';

const chatKnowledgeBase = new ContractorDelayTrainingGuide();
const chatKnowledgePromptBuilder = new DelayKnowledgePromptBuilder(chatKnowledgeBase);

const EXCERPT_LENGTH = 800;
const MAX_DOCUMENTS_IN_CONTEXT = 10;

const SYSTEM_PROMPT_WITH_TOOLS = `You are a specialized construction delay analysis expert and verification assistant. Your purpose is to help users verify whether delay events were correctly identified, analyze their classifications, and provide detailed reasoning based on the Contractor Delay Training Guide.

## YOUR CAPABILITIES:

You have access to the following tools to investigate delay events:

1. **search_documents_by_filename** - Find documents by filename, date code, or inspector initials
2. **get_document_content** - Retrieve the full text of a source document
3. **get_delay_events_by_document** - Find all delay events extracted from a specific document
4. **get_schedule_activity_details** - Look up CPM schedule activity details by activity ID

## ANALYTICAL METHODOLOGY:

When a user asks you to verify or analyze a delay event, follow this exact workflow:

### Step 1: LOCATE THE SOURCE
- If the user mentions a document filename, use search_documents_by_filename to find it
- If they mention a delay event, use get_delay_events_by_document to find events from that document

### Step 2: READ THE EVIDENCE
- Use get_document_content to retrieve the full document text
- Focus on diary entries, timestamps, and narrative descriptions
- Note exact timestamps and durations mentioned

### Step 3: CROSS-REFERENCE THE TRAINING GUIDE
Using the Contractor Delay Training Guide knowledge base below, evaluate:
- Which delay CATEGORY does this event fall under? (Resource & Staffing, Subcontractor & Supplier, Quality Deficiencies, Planning & Coordination, Equipment Failures)
- Does it match any specific INDICATOR in that category?
- Does it pass the CORE TEST: "Was the Contractor doing everything within its power to diligently prosecute the Work?"
- Does any EXCLUSION apply? (DSCs, owner-directed suspensions, unforeseen conditions, etc.)
- Walk through the DECISION FRAMEWORK questions
- Compare to relevant WORKED EXAMPLES

### Step 4: PROVIDE YOUR VERDICT
- State whether the classification is correct, with your reasoning
- Assess the confidence level and whether it's appropriate
- Note if the duration estimate is supported by the evidence
- Flag any gray areas or aspects that need human judgment
- Reference specific sections of the Training Guide in your analysis

## CRITICAL RULES:

1. **ONLY answer questions about the delay events data and documents in this project.**
2. **REFUSE questions not directly about delay analysis.** Say: "I can only answer questions about the delay events in this project."
3. **Base ALL answers strictly on the data, documents, and Training Guide.** Never make up information.
4. **Always show your reasoning** - walk through the Training Guide criteria step by step.
5. **Be honest about gray areas** - if a classification is borderline, say so and explain why.
6. **Reference timestamps and diary entries** when discussing evidence from documents.

## DOCUMENT ACCESS:
- Document excerpts are provided below for quick reference
- If you need the FULL content of any document, use the get_document_content tool
- Use search_documents_by_filename when the user references a document by name
- Always cite source documents when explaining delay classifications

## DURATION ESTIMATION METHODOLOGY:

### For Inspector Daily Reports (IDRs):
- Durations are estimated by interpreting the narrative and timestamps
- **Explicit timestamp gaps**: "0930-crew stopped, 1100-resumed" = 1.5 hours
- **Explicit mentions**: "crew arrived 2 hours late" → 2 hours
- **Estimated from context**: Equipment breakdowns, crew shortages → estimated based on typical resolution times

### For Non-Conformance Reports (NCRs):
- NCR = rework required = definite delay
- Duration = removal time + redo time + re-inspection time

## DELAY EVENTS DATA:
`;

function formatEventsForContext(
  events: ContractorDelayEvent[],
  sourceDocuments?: Map<string, DocumentContentSummary>
): string {
  if (events.length === 0) {
    return "\n[No delay events recorded yet.]\n";
  }

  const eventSummaries = events.map((event, index) => {
    const parts = [
      `${index + 1}. ${event.eventDescription}`,
      `   - Category: ${formatCategory(event.eventCategory)}`,
      `   - Date: ${event.eventStartDate ? new Date(event.eventStartDate).toLocaleDateString() : 'N/A'}`,
      `   - Duration: ${event.impactDurationHours ? `${event.impactDurationHours} hours` : 'N/A'}`,
      `   - Status: ${event.verificationStatus}`,
    ];
    
    if (event.cpmActivityId) {
      parts.push(`   - Matched Activity: ${event.cpmActivityId} - ${event.cpmActivityDescription || 'N/A'}`);
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
        parts.push(`   - Source Document ID: ${event.sourceDocumentId}`);
        parts.push(`   - Source Document: ${doc.filename} (${doc.documentType.toUpperCase()})`);
      }
    }
    
    return parts.join('\n');
  });

  return `\nTotal Events: ${events.length}\n\n${eventSummaries.join('\n\n')}`;
}

function formatDocumentExcerpts(
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

  const excerpts: string[] = [];
  let count = 0;
  
  for (const docId of Array.from(referencedDocIds)) {
    if (count >= MAX_DOCUMENTS_IN_CONTEXT) break;
    
    const doc = sourceDocuments.get(docId);
    if (doc && doc.fullContent) {
      const excerpt = doc.fullContent.substring(0, EXCERPT_LENGTH);
      const hasMore = doc.fullContent.length > EXCERPT_LENGTH;
      
      excerpts.push(
        `### ${doc.filename} (${doc.documentType.toUpperCase()}) [ID: ${docId}]` +
        `\n${excerpt}${hasMore ? '...\n[Use get_document_content tool for full text]' : ''}`
      );
      count++;
    }
  }

  if (excerpts.length === 0) {
    return '';
  }

  return `\n\n## DOCUMENT EXCERPTS (use get_document_content for full text):\n\n${excerpts.join('\n\n---\n\n')}`;
}

function formatCategory(category: string | null): string {
  if (!category) return 'Unknown';
  return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export class StreamingOpenAIDelayEventsChatService implements IStreamingDelayEventsChatService {
  private readonly openai: OpenAI | null;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPEN_AI_KEY;
    this.openai = key ? new OpenAI({ apiKey: key }) : null;
  }

  async streamChat(
    request: StreamingDelayEventsChatRequest,
    onEvent: (event: StreamingChatEvent) => void,
    options?: { toolExecutor?: IChatToolExecutor }
  ): Promise<void> {
    const toolExecutor = options?.toolExecutor ?? null;
    if (!this.openai) {
      onEvent({
        type: 'error',
        message: 'OpenAI API key not configured. Please set OPEN_AI_KEY environment variable.'
      });
      return;
    }

    onEvent({
      type: 'progress',
      stage: 'analyzing',
      message: 'Analyzing your question...'
    });

    const eventsContext = formatEventsForContext(
      request.delayEvents,
      request.sourceDocuments
    );
    const excerpts = formatDocumentExcerpts(
      request.delayEvents,
      request.sourceDocuments
    );
    const knowledgeBasePrompt = chatKnowledgePromptBuilder.buildPromptForDocumentType('idr');
    const fullSystemPrompt = SYSTEM_PROMPT_WITH_TOOLS + eventsContext + excerpts + '\n\n' + knowledgeBasePrompt;

    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    
    for (const msg of request.conversationHistory || []) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }
    
    messages.push({
      role: 'user',
      content: request.userMessage
    });

    const tools: OpenAI.ChatCompletionTool[] | undefined = toolExecutor 
      ? toolExecutor.getAvailableTools().map(tool => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        }))
      : undefined;

    try {
      let continueLoop = true;
      let currentMessages = [...messages];
      let finalContent = '';

      while (continueLoop) {
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4.1',
          messages: [
            { role: 'system', content: fullSystemPrompt },
            ...currentMessages
          ],
          tools,
          stream: true,
          max_completion_tokens: 2000,
          temperature: 0.3
        });

        let accumulatedContent = '';
        finalContent = '';
        let toolCalls: Array<{
          id: string;
          function: { name: string; arguments: string };
        }> = [];
        let currentToolCall: { id: string; function: { name: string; arguments: string } } | null = null;

        for await (const chunk of response) {
          const delta = chunk.choices[0]?.delta;

          if (delta?.content) {
            accumulatedContent += delta.content;
            onEvent({
              type: 'content',
              content: delta.content
            });
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.id) {
                if (currentToolCall) {
                  toolCalls.push(currentToolCall);
                }
                currentToolCall = {
                  id: tc.id,
                  function: { name: tc.function?.name || '', arguments: '' }
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

        if (toolCalls.length > 0 && toolExecutor) {
          currentMessages.push({
            role: 'assistant',
            content: accumulatedContent || null,
            tool_calls: toolCalls.map(tc => ({
              id: tc.id,
              type: 'function' as const,
              function: tc.function
            }))
          });

          for (const tc of toolCalls) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function.arguments);
            } catch {
              args = {};
            }

            const documentId = args.document_id as string;
            onEvent({
              type: 'progress',
              stage: 'fetching_document',
              message: `Fetching document content...`,
              details: { documentId }
            });

            const toolCall: ChatToolCall = {
              toolName: tc.function.name,
              toolCallId: tc.id,
              arguments: args
            };

            const result = await toolExecutor.execute(toolCall);

            currentMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(result.error || result.result)
            });
          }

          onEvent({
            type: 'progress',
            stage: 'generating_response',
            message: 'Generating response with document content...'
          });
        } else {
          finalContent = accumulatedContent;
          continueLoop = false;
        }
      }

      onEvent({
        type: 'done',
        isRefusal: this.detectRefusal(finalContent)
      });

    } catch (error) {
      console.error('Error in streaming delay events chat:', error);
      onEvent({
        type: 'error',
        message: 'I encountered an issue processing your request. Please try again.'
      });
    }
  }

  private detectRefusal(response: string): boolean {
    const refusalPatterns = [
      'can only answer questions about',
      'only help with questions about the delay',
      'cannot help with that',
    ];
    
    const lowerResponse = response.toLowerCase();
    return refusalPatterns.some(pattern => lowerResponse.includes(pattern));
  }
}
