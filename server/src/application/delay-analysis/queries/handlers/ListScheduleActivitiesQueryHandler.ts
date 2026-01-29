import type { ListScheduleActivitiesQuery } from '../ListScheduleActivitiesQuery';
import type { IScheduleActivityRepository } from '../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import type { ScheduleActivity } from '../../../../domain/delay-analysis/entities/ScheduleActivity';

function formatDateOnly(date: Date | null): string | null {
  if (!date) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
  totalFloat: number | null;
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
      plannedStartDate: formatDateOnly(activity.plannedStartDate),
      plannedFinishDate: formatDateOnly(activity.plannedFinishDate),
      actualStartDate: formatDateOnly(activity.actualStartDate),
      actualFinishDate: formatDateOnly(activity.actualFinishDate),
      scheduleUpdateMonth: activity.scheduleUpdateMonth,
      isCriticalPath: activity.isCriticalPath,
      totalFloat: activity.totalFloat,
      sourceDocumentId: activity.sourceDocumentId,
      createdAt: activity.createdAt.toISOString(),
    };
  }
}
