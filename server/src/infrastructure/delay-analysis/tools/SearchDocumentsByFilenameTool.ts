import type {
  IChatToolExecutor,
  ChatToolCall,
  ChatToolResult,
  ChatToolDefinition
} from '../../../domain/delay-analysis/interfaces/IChatToolExecutor';
import type { SearchDocumentsByFilenameQueryHandler } from '../../../application/delay-analysis/queries/handlers/SearchDocumentsByFilenameQueryHandler';
import { SearchDocumentsByFilenameQuery } from '../../../application/delay-analysis/queries/SearchDocumentsByFilenameQuery';

export class SearchDocumentsByFilenameTool implements IChatToolExecutor {
  private readonly projectId: string;
  private readonly tenantId: string;

  constructor(
    private readonly queryHandler: SearchDocumentsByFilenameQueryHandler,
    projectId: string,
    tenantId: string
  ) {
    this.projectId = projectId;
    this.tenantId = tenantId;
  }

  async execute(toolCall: ChatToolCall): Promise<ChatToolResult> {
    if (toolCall.toolName !== 'search_documents_by_filename') {
      return {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: null,
        error: `Unknown tool: ${toolCall.toolName}`
      };
    }

    const filenamePattern = toolCall.arguments.filename_pattern as string;

    if (!filenamePattern) {
      return {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: null,
        error: 'filename_pattern is required'
      };
    }

    const query = new SearchDocumentsByFilenameQuery(
      this.projectId,
      this.tenantId,
      filenamePattern
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
        name: 'search_documents_by_filename',
        description: 'Search for project documents by filename or partial filename. Use this to find documents when the user mentions a specific document name, date code (e.g., 250804), or document type code (e.g., IDR, NCR). Returns document IDs, filenames, types, and dates - use get_document_content to retrieve the full text.',
        parameters: {
          type: 'object',
          properties: {
            filename_pattern: {
              type: 'string',
              description: "Search pattern for the document filename. Can be a partial match - e.g., '250804' to find all documents from August 4, 2025, or 'IDR_250804_KRS' for a specific inspector's report."
            }
          },
          required: ['filename_pattern']
        }
      }
    ];
  }
}
