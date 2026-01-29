import type { ScheduleActivity } from '../entities/ScheduleActivity';

export interface IScheduleActivityRepository {
  findById(id: string, tenantId: string): Promise<ScheduleActivity | null>;
  findByIds(ids: string[], tenantId: string): Promise<ScheduleActivity[]>;
  findByProjectId(projectId: string, tenantId: string): Promise<ScheduleActivity[]>;
  findByActivityId(projectId: string, tenantId: string, activityId: string): Promise<ScheduleActivity | null>;
  findActiveOnDate(projectId: string, tenantId: string, date: Date): Promise<ScheduleActivity[]>;
  save(activity: ScheduleActivity): Promise<void>;
  saveBatch(activities: ScheduleActivity[]): Promise<void>;
  deleteByProjectId(projectId: string, tenantId: string): Promise<void>;
  deleteByDocumentId(documentId: string, tenantId: string): Promise<void>;
}
