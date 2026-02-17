import type { ITool, ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../../../domain/delay-analysis/interfaces/ITool';
import type { SearchDocumentsByFilenameQueryHandler } from '../../../../application/delay-analysis/queries/handlers/SearchDocumentsByFilenameQueryHandler';
import { SearchDocumentsByFilenameQuery } from '../../../../application/delay-analysis/queries/SearchDocumentsByFilenameQuery';

export class SearchDocumentsByFilenameTool implements ITool {
  readonly definition: ToolDefinition;

  constructor(private readonly queryHandler: SearchDocumentsByFilenameQueryHandler) {
    this.definition = {
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
    };
  }

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const filenamePattern = args.filename_pattern as string;

    if (!filenamePattern) {
      return {
        success: false,
        output: null,
        error: 'filename_pattern is required'
      };
    }

    console.log(`[SearchDocumentsByFilenameTool] Invoked with args: ${JSON.stringify(args).substring(0, 200)}`);

    try {
      const query = new SearchDocumentsByFilenameQuery(
        context.projectId,
        context.tenantId,
        filenamePattern
      );

      const results = await this.queryHandler.execute(query);

      console.log(`[SearchDocumentsByFilenameTool] Success - found ${results.length} documents`);

      return {
        success: true,
        output: results
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[SearchDocumentsByFilenameTool] Error: ${message}`);
      return {
        success: false,
        output: null,
        error: message
      };
    }
  }
}
