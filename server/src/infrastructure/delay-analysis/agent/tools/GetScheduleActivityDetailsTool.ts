import type { ITool, ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../../../domain/delay-analysis/interfaces/ITool';
import type { GetActivitiesByIdsQueryHandler } from '../../../../application/delay-analysis/queries/handlers/GetActivitiesByIdsQueryHandler';

export class GetScheduleActivityDetailsTool implements ITool {
  readonly definition: ToolDefinition;

  constructor(private readonly queryHandler: GetActivitiesByIdsQueryHandler) {
    this.definition = {
      name: 'get_schedule_activity_details',
      description: "Look up CPM schedule activity details by activity ID codes (e.g., '1-PF-0130', '2-SW-0745'). Returns activity description, planned/actual start and finish dates, critical path status, and total float. Use this to verify if a delay event was correctly matched to a schedule activity.",
      parameters: {
        type: 'object',
        properties: {
          activity_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of activity ID codes to look up.'
          }
        },
        required: ['activity_ids']
      }
    };
  }

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const activityIds = args.activity_ids as string[];

    if (!activityIds || !Array.isArray(activityIds) || activityIds.length === 0) {
      return {
        success: false,
        output: null,
        error: 'activity_ids is required and must be a non-empty array of strings'
      };
    }

    console.log(`[GetScheduleActivityDetailsTool] Invoked with args: ${JSON.stringify(args).substring(0, 200)}`);

    try {
      const result = await this.queryHandler.execute({
        tenantId: context.tenantId,
        projectId: context.projectId,
        activityIds
      });

      console.log(`[GetScheduleActivityDetailsTool] Success - found ${result.found.length}, not found ${result.notFound.length}`);

      return {
        success: true,
        output: {
          found: result.found,
          notFound: result.notFound
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[GetScheduleActivityDetailsTool] Error: ${message}`);
      return {
        success: false,
        output: null,
        error: message
      };
    }
  }
}
