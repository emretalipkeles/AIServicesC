import { eq, and, lte, gte, or, isNull, inArray } from 'drizzle-orm';
import type { IScheduleActivityRepository } from '../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import { ScheduleActivity } from '../../../../domain/delay-analysis/entities/ScheduleActivity';
import { scheduleActivities } from '@shared/schema';
import { db } from '../../../database';

export class DrizzleScheduleActivityRepository implements IScheduleActivityRepository {
  async findById(id: string, tenantId: string): Promise<ScheduleActivity | null> {
    const result = await db
      .select()
      .from(scheduleActivities)
      .where(and(eq(scheduleActivities.id, id), eq(scheduleActivities.tenantId, tenantId)))
      .limit(1);

    if (result.length === 0) return null;

    return this.mapRowToEntity(result[0]);
  }

  async findByIds(ids: string[], tenantId: string): Promise<ScheduleActivity[]> {
    if (ids.length === 0) return [];

    const result = await db
      .select()
      .from(scheduleActivities)
      .where(and(
        inArray(scheduleActivities.id, ids),
        eq(scheduleActivities.tenantId, tenantId)
      ));

    return result.map(row => this.mapRowToEntity(row));
  }

  async findByProjectId(projectId: string, tenantId: string): Promise<ScheduleActivity[]> {
    const result = await db
      .select()
      .from(scheduleActivities)
      .where(and(
        eq(scheduleActivities.projectId, projectId), 
        eq(scheduleActivities.tenantId, tenantId)
      ));

    return result.map(row => this.mapRowToEntity(row));
  }

  async findByActivityId(projectId: string, tenantId: string, activityId: string): Promise<ScheduleActivity | null> {
    const normalizedId = activityId.toUpperCase().trim();
    const idsToTry = this.generateActivityIdVariants(normalizedId);
    
    for (const idVariant of idsToTry) {
      const result = await db
        .select()
        .from(scheduleActivities)
        .where(and(
          eq(scheduleActivities.projectId, projectId),
          eq(scheduleActivities.tenantId, tenantId),
          eq(scheduleActivities.activityId, idVariant)
        ))
        .limit(1);

      if (result.length > 0) {
        if (idVariant !== normalizedId) {
          console.log(`[DrizzleScheduleActivityRepository] Matched "${normalizedId}" to "${idVariant}" (normalized)`);
        }
        return this.mapRowToEntity(result[0]);
      }
    }

    return null;
  }

  private generateActivityIdVariants(activityId: string): string[] {
    const variants = [activityId];
    
    const segments = activityId.split('-');
    if (segments.length >= 2) {
      const withoutLeadingZeros = segments.map((seg, idx) => {
        if (idx === 0 && /^0+\d+$/.test(seg)) {
          return seg.replace(/^0+/, '');
        }
        return seg;
      }).join('-');
      
      if (withoutLeadingZeros !== activityId) {
        variants.push(withoutLeadingZeros);
      }
      
      const firstSeg = segments[0];
      if (/^\d+$/.test(firstSeg) && !firstSeg.startsWith('0')) {
        const withLeadingZero = ['0' + firstSeg, ...segments.slice(1)].join('-');
        variants.push(withLeadingZero);
      }
    }
    
    return variants;
  }

  async findActiveOnDate(projectId: string, tenantId: string, date: Date): Promise<ScheduleActivity[]> {
    const result = await db
      .select()
      .from(scheduleActivities)
      .where(and(
        eq(scheduleActivities.projectId, projectId),
        eq(scheduleActivities.tenantId, tenantId),
        or(
          lte(scheduleActivities.actualStartDate, date),
          lte(scheduleActivities.plannedStartDate, date)
        ),
        or(
          isNull(scheduleActivities.actualFinishDate),
          gte(scheduleActivities.actualFinishDate, date),
          isNull(scheduleActivities.plannedFinishDate),
          gte(scheduleActivities.plannedFinishDate, date)
        )
      ));

    return result.map(row => this.mapRowToEntity(row));
  }

  async save(activity: ScheduleActivity): Promise<void> {
    await db.insert(scheduleActivities).values({
      id: activity.id,
      projectId: activity.projectId,
      tenantId: activity.tenantId,
      sourceDocumentId: activity.sourceDocumentId,
      activityId: activity.activityId,
      wbs: activity.wbs,
      activityDescription: activity.activityDescription,
      plannedStartDate: activity.plannedStartDate,
      plannedFinishDate: activity.plannedFinishDate,
      actualStartDate: activity.actualStartDate,
      actualFinishDate: activity.actualFinishDate,
      scheduleUpdateMonth: activity.scheduleUpdateMonth,
      isCriticalPath: activity.isCriticalPath,
      totalFloat: activity.totalFloat,
      metadata: activity.metadata,
      createdAt: activity.createdAt,
    }).onConflictDoNothing();
  }

  async saveBatch(activities: ScheduleActivity[]): Promise<void> {
    if (activities.length === 0) return;
    
    await db.insert(scheduleActivities).values(
      activities.map(activity => ({
        id: activity.id,
        projectId: activity.projectId,
        tenantId: activity.tenantId,
        sourceDocumentId: activity.sourceDocumentId,
        activityId: activity.activityId,
        wbs: activity.wbs,
        activityDescription: activity.activityDescription,
        plannedStartDate: activity.plannedStartDate,
        plannedFinishDate: activity.plannedFinishDate,
        actualStartDate: activity.actualStartDate,
        actualFinishDate: activity.actualFinishDate,
        scheduleUpdateMonth: activity.scheduleUpdateMonth,
        isCriticalPath: activity.isCriticalPath,
        totalFloat: activity.totalFloat,
        metadata: activity.metadata,
        createdAt: activity.createdAt,
      }))
    ).onConflictDoNothing();
  }

  async deleteByProjectId(projectId: string, tenantId: string): Promise<void> {
    await db
      .delete(scheduleActivities)
      .where(and(
        eq(scheduleActivities.projectId, projectId), 
        eq(scheduleActivities.tenantId, tenantId)
      ));
  }

  async deleteByDocumentId(documentId: string, tenantId: string): Promise<void> {
    await db
      .delete(scheduleActivities)
      .where(and(
        eq(scheduleActivities.sourceDocumentId, documentId), 
        eq(scheduleActivities.tenantId, tenantId)
      ));
  }

  private mapRowToEntity(row: typeof scheduleActivities.$inferSelect): ScheduleActivity {
    return new ScheduleActivity({
      id: row.id,
      projectId: row.projectId,
      tenantId: row.tenantId,
      sourceDocumentId: row.sourceDocumentId,
      activityId: row.activityId,
      wbs: row.wbs,
      activityDescription: row.activityDescription,
      plannedStartDate: row.plannedStartDate,
      plannedFinishDate: row.plannedFinishDate,
      actualStartDate: row.actualStartDate,
      actualFinishDate: row.actualFinishDate,
      scheduleUpdateMonth: row.scheduleUpdateMonth,
      isCriticalPath: row.isCriticalPath ?? 'unknown',
      totalFloat: row.totalFloat,
      metadata: row.metadata as Record<string, unknown> | null,
      createdAt: row.createdAt ?? new Date(),
    });
  }
}
