import type {
  IChatToolExecutor,
  ChatToolCall,
  ChatToolResult,
  ChatToolDefinition
} from '../../../domain/delay-analysis/interfaces/IChatToolExecutor';
import type { GetDelayEventsByDocumentQueryHandler } from '../../../application/delay-analysis/queries/handlers/GetDelayEventsByDocumentQueryHandler';
import { GetDelayEventsByDocumentQuery } from '../../../application/delay-analysis/queries/GetDelayEventsByDocumentQuery';

export class GetDelayEventsByDocumentTool implements IChatToolExecutor {
  private readonly projectId: string;
  private readonly tenantId: string;

  constructor(
    private readonly queryHandler: GetDelayEventsByDocumentQueryHandler,
    projectId: string,
    tenantId: string
  ) {
    this.projectId = projectId;
    this.tenantId = tenantId;
  }

  async execute(toolCall: ChatToolCall): Promise<ChatToolResult> {
    if (toolCall.toolName !== 'get_delay_events_by_document') {
      return {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: null,
        error: `Unknown tool: ${toolCall.toolName}`
      };
    }

    const documentId = toolCall.arguments.document_id as string;

    if (!documentId) {
      return {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: null,
        error: 'document_id is required'
      };
    }

    const query = new GetDelayEventsByDocumentQuery(
      documentId,
      this.projectId,
      this.tenantId
    );

    const results = await this.queryHandler.execute(query);

    return {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      result: results
    };
  }

  getAvailableTools(): ChatToolDefinition[] {
    return [
      {
        name: 'get_delay_events_by_document',
        description: 'Retrieve all contractor delay events that were extracted from a specific source document. Returns event details including description, category, duration, confidence scores, matched activity, and source references. Use this after finding a document to see what delays were identified in it.',
        parameters: {
          type: 'object',
          properties: {
            document_id: {
              type: 'string',
              description: 'The unique identifier of the source document. Get this from search_documents_by_filename results.'
            }
          },
          required: ['document_id']
        }
      }
    ];
  }
}
