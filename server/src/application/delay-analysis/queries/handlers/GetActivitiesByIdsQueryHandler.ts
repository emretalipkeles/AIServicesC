import type { GetActivitiesByIdsQuery } from '../GetActivitiesByIdsQuery';
import type { IScheduleActivityRepository } from '../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import type { ScheduleActivity } from '../../../../domain/delay-analysis/entities/ScheduleActivity';

export interface ScheduleActivityForMatchingDto {
  activityId: string;
  wbs: string | null;
  activityDescription: string;
  plannedStartDate: Date | null;
  plannedFinishDate: Date | null;
  actualStartDate: Date | null;
  actualFinishDate: Date | null;
  isCriticalPath: string;
  totalFloat: number | null;
}

export interface GetActivitiesByIdsResult {
  found: ScheduleActivityForMatchingDto[];
  notFound: string[];
}

export class GetActivitiesByIdsQueryHandler {
  constructor(private readonly scheduleRepository: IScheduleActivityRepository) {}

  async execute(query: GetActivitiesByIdsQuery): Promise<GetActivitiesByIdsResult> {
    const { tenantId, projectId, activityIds } = query;

    if (!activityIds || activityIds.length === 0) {
      return { found: [], notFound: [] };
    }

    const uniqueIds = Array.from(new Set(activityIds.map(id => id.trim().toUpperCase())));
    const found: ScheduleActivityForMatchingDto[] = [];
    const notFound: string[] = [];

    for (const activityId of uniqueIds) {
      const activity = await this.scheduleRepository.findByActivityId(
        projectId,
        tenantId,
        activityId
      );

      if (activity) {
        found.push(this.mapToDto(activity));
      } else {
        notFound.push(activityId);
      }
    }

    console.log(`[GetActivitiesByIdsQueryHandler] Looked up ${uniqueIds.length} activities: ${found.length} found, ${notFound.length} not found`);

    return { found, notFound };
  }

  private mapToDto(activity: ScheduleActivity): ScheduleActivityForMatchingDto {
    return {
      activityId: activity.activityId,
      wbs: activity.wbs,
      activityDescription: activity.activityDescription,
      plannedStartDate: activity.plannedStartDate,
      plannedFinishDate: activity.plannedFinishDate,
      actualStartDate: activity.actualStartDate,
      actualFinishDate: activity.actualFinishDate,
      isCriticalPath: activity.isCriticalPath,
      totalFloat: activity.totalFloat,
    };
  }
}
