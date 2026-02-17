import type {
  IChatToolExecutor,
  ChatToolCall,
  ChatToolResult,
  ChatToolDefinition
} from '../../../domain/delay-analysis/interfaces/IChatToolExecutor';
import type { GetActivitiesByIdsQueryHandler } from '../../../application/delay-analysis/queries/handlers/GetActivitiesByIdsQueryHandler';

export class GetScheduleActivityDetailsTool implements IChatToolExecutor {
  private readonly projectId: string;
  private readonly tenantId: string;

  constructor(
    private readonly queryHandler: GetActivitiesByIdsQueryHandler,
    projectId: string,
    tenantId: string
  ) {
    this.projectId = projectId;
    this.tenantId = tenantId;
  }

  async execute(toolCall: ChatToolCall): Promise<ChatToolResult> {
    if (toolCall.toolName !== 'get_schedule_activity_details') {
      return {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: null,
        error: `Unknown tool: ${toolCall.toolName}`
      };
    }

    const activityIds = toolCall.arguments.activity_ids as string[];

    if (!activityIds || !Array.isArray(activityIds) || activityIds.length === 0) {
      return {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: null,
        error: 'activity_ids is required and must be a non-empty array of strings'
      };
    }

    const result = await this.queryHandler.execute({
      tenantId: this.tenantId,
      projectId: this.projectId,
      activityIds,
    });

    return {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      result: {
        found: result.found,
        notFound: result.notFound,
      }
    };
  }

  getAvailableTools(): ChatToolDefinition[] {
    return [
      {
        name: 'get_schedule_activity_details',
        description: "Look up CPM schedule activity details by activity ID codes (e.g., '1-PF-0130', '2-SW-0745'). Returns activity description, planned/actual start and finish dates, critical path status, and total float. Use this to verify if a delay event was correctly matched to a schedule activity.",
        parameters: {
          type: 'object',
          properties: {
            activity_ids: {
              type: 'array',
              description: 'Array of activity ID codes to look up. Provide as an array of strings, e.g. ["1-PF-0130", "2-SW-0745"].'
            }
          },
          required: ['activity_ids']
        }
      }
    ];
  }
}
