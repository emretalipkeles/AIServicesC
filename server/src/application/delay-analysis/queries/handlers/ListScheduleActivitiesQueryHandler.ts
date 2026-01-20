import type { ListScheduleActivitiesQuery } from '../ListScheduleActivitiesQuery';
import type { IScheduleActivityRepository } from '../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import type { ScheduleActivity } from '../../../../domain/delay-analysis/entities/ScheduleActivity';

export interface ScheduleActivityDto {
  id: string;
  activityId: string;
  wbs: string | null;
  activityDescription: string;
  plannedStartDate: string | null;
  plannedFinishDate: string | null;
  actualStartDate: string | null;
  actualFinishDate: string | null;
  scheduleUpdateMonth: string | null;
  isCriticalPath: string;
  sourceDocumentId: string | null;
  createdAt: string;
}

export class ListScheduleActivitiesQueryHandler {
  constructor(private readonly scheduleRepository: IScheduleActivityRepository) {}

  async execute(query: ListScheduleActivitiesQuery): Promise<ScheduleActivityDto[]> {
    const activities = await this.scheduleRepository.findByProjectId(
      query.projectId,
      query.tenantId
    );

    return activities.map(this.mapToDto);
  }

  private mapToDto(activity: ScheduleActivity): ScheduleActivityDto {
    return {
      id: activity.id,
      activityId: activity.activityId,
      wbs: activity.wbs,
      activityDescription: activity.activityDescription,
      plannedStartDate: activity.plannedStartDate?.toISOString() ?? null,
      plannedFinishDate: activity.plannedFinishDate?.toISOString() ?? null,
      actualStartDate: activity.actualStartDate?.toISOString() ?? null,
      actualFinishDate: activity.actualFinishDate?.toISOString() ?? null,
      scheduleUpdateMonth: activity.scheduleUpdateMonth,
      isCriticalPath: activity.isCriticalPath,
      sourceDocumentId: activity.sourceDocumentId,
      createdAt: activity.createdAt.toISOString(),
    };
  }
}
