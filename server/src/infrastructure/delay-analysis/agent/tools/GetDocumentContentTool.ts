import type { ITool, ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../../../domain/delay-analysis/interfaces/ITool';
import type { GetDocumentContentQueryHandler } from '../../../../application/delay-analysis/queries/handlers/GetDocumentContentQueryHandler';
import { GetDocumentContentQuery } from '../../../../application/delay-analysis/queries/GetDocumentContentQuery';

export class GetDocumentContentTool implements ITool {
  readonly definition: ToolDefinition;

  constructor(private readonly queryHandler: GetDocumentContentQueryHandler) {
    this.definition = {
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

    console.log(`[GetDocumentContentTool] Invoked with args: ${JSON.stringify(args).substring(0, 200)}`);

    try {
      const query = new GetDocumentContentQuery(
        documentId,
        context.projectId,
        context.tenantId
      );

      const result = await this.queryHandler.handle(query);

      if (!result.found) {
        console.log(`[GetDocumentContentTool] Document not found: ${result.error}`);
        return {
          success: false,
          output: null,
          error: result.error
        };
      }

      console.log(`[GetDocumentContentTool] Success - retrieved document ${documentId}`);

      return {
        success: true,
        output: {
          documentId: result.document!.documentId,
          filename: result.document!.filename,
          documentType: result.document!.documentType,
          reportDate: result.document!.reportDate,
          content: result.document!.fullContent
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[GetDocumentContentTool] Error: ${message}`);
      return {
        success: false,
        output: null,
        error: message
      };
    }
  }
}
