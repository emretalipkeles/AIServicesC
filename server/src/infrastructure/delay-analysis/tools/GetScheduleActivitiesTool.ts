import type {
  IExtractionToolExecutor,
  ScheduleActivityLookupParams,
  ScheduleActivityLookupResult,
  ScheduleActivityLookupDto,
  ExtractionToolDefinition,
} from '../../../domain/delay-analysis/interfaces/IExtractionToolExecutor';
import type { GetActivitiesByIdsQueryHandler } from '../../../application/delay-analysis/queries/handlers/GetActivitiesByIdsQueryHandler';

export class GetScheduleActivitiesTool implements IExtractionToolExecutor {
  readonly toolName = 'get_schedule_activities';

  constructor(
    private readonly queryHandler: GetActivitiesByIdsQueryHandler
  ) {}

  getToolDefinition(): ExtractionToolDefinition {
    return {
      name: this.toolName,
      description: 'Look up schedule activities by their activity IDs from the project schedule. Use this when you detect activity IDs (e.g., "Activity 1234", "WBS 05.02.01") in the document to get the full activity details for accurate matching.',
      parameters: {
        type: 'object',
        properties: {
          activity_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of activity IDs to look up (e.g., ["1234", "5678", "05.02.01"])'
          }
        },
        required: ['activity_ids']
      }
    };
  }

  async execute(params: ScheduleActivityLookupParams): Promise<ScheduleActivityLookupResult> {
    console.log(`[GetScheduleActivitiesTool] Looking up ${params.activityIds.length} activity IDs:`, params.activityIds);

    const result = await this.queryHandler.execute({
      tenantId: params.tenantId,
      projectId: params.projectId,
      activityIds: params.activityIds,
    });

    const foundActivities: ScheduleActivityLookupDto[] = result.found.map(dto => ({
      activityId: dto.activityId,
      wbs: dto.wbs,
      activityDescription: dto.activityDescription,
      plannedStartDate: dto.plannedStartDate,
      plannedFinishDate: dto.plannedFinishDate,
      actualStartDate: dto.actualStartDate,
      actualFinishDate: dto.actualFinishDate,
      isCriticalPath: dto.isCriticalPath,
      totalFloat: dto.totalFloat,
    }));

    console.log(`[GetScheduleActivitiesTool] Found ${foundActivities.length} activities, ${result.notFound.length} not found`);
    if (result.notFound.length > 0) {
      console.log(`[GetScheduleActivitiesTool] Not found IDs:`, result.notFound);
    }

    return {
      found: foundActivities,
      notFound: result.notFound,
    };
  }
}
