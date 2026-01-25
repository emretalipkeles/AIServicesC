import type { 
  IChatToolExecutor, 
  ChatToolCall, 
  ChatToolResult, 
  ChatToolDefinition 
} from '../../../domain/delay-analysis/interfaces/IChatToolExecutor';
import type { GetDocumentContentQueryHandler } from '../../../application/delay-analysis/queries/handlers/GetDocumentContentQueryHandler';
import { GetDocumentContentQuery } from '../../../application/delay-analysis/queries/GetDocumentContentQuery';

export class GetDocumentContentTool implements IChatToolExecutor {
  private readonly projectId: string;
  private readonly tenantId: string;

  constructor(
    private readonly queryHandler: GetDocumentContentQueryHandler,
    projectId: string,
    tenantId: string
  ) {
    this.projectId = projectId;
    this.tenantId = tenantId;
  }

  async execute(toolCall: ChatToolCall): Promise<ChatToolResult> {
    if (toolCall.toolName !== 'get_document_content') {
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

    const query = new GetDocumentContentQuery(
      documentId,
      this.projectId,
      this.tenantId
    );

    const result = await this.queryHandler.handle(query);

    if (!result.found) {
      return {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: null,
        error: result.error
      };
    }

    return {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      result: {
        documentId: result.document!.documentId,
        filename: result.document!.filename,
        documentType: result.document!.documentType,
        reportDate: result.document!.reportDate,
        content: result.document!.fullContent
      }
    };
  }

  getAvailableTools(): ChatToolDefinition[] {
    return [
      {
        name: 'get_document_content',
        description: 'Retrieve the full text content of a source document by its ID. Use this when you need to examine the original document text to answer questions about how delay events were extracted or to find specific details mentioned in the document.',
        parameters: {
          type: 'object',
          properties: {
            document_id: {
              type: 'string',
              description: 'The unique identifier of the document to retrieve. This ID is provided in the delay event source information.'
            }
          },
          required: ['document_id']
        }
      }
    ];
  }
}
