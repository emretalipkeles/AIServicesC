import type { ITool, ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../../../domain/delay-analysis/interfaces/ITool';
import type { GetDelayEventsByDocumentQueryHandler } from '../../../../application/delay-analysis/queries/handlers/GetDelayEventsByDocumentQueryHandler';
import { GetDelayEventsByDocumentQuery } from '../../../../application/delay-analysis/queries/GetDelayEventsByDocumentQuery';

export class GetDelayEventsByDocumentTool implements ITool {
  readonly definition: ToolDefinition;

  constructor(private readonly queryHandler: GetDelayEventsByDocumentQueryHandler) {
    this.definition = {
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
    };
  }

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const documentId = args.document_id as string;

    if (!documentId) {
      return {
        success: false,
        output: null,
        error: 'document_id is required'
      };
    }

    console.log(`[GetDelayEventsByDocumentTool] Invoked with args: ${JSON.stringify(args).substring(0, 200)}`);

    try {
      const query = new GetDelayEventsByDocumentQuery(
        documentId,
        context.projectId,
        context.tenantId
      );

      const results = await this.queryHandler.execute(query);

      console.log(`[GetDelayEventsByDocumentTool] Success - found ${results.length} delay events`);

      return {
        success: true,
        output: results
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[GetDelayEventsByDocumentTool] Error: ${message}`);
      return {
        success: false,
        output: null,
        error: message
      };
    }
  }
}
