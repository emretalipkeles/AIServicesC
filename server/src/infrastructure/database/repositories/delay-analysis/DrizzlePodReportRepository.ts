import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import type { IPodReportRepository } from '../../../../domain/delay-analysis/repositories/IPodReportRepository';
import { PodReport } from '../../../../domain/delay-analysis/entities/PodReport';
import {
  podReports,
  podSections,
  podCrewMembers,
  podEquipment,
  podTaskLines,
} from '@shared/schema';
import { db } from '../../../database';

export class DrizzlePodReportRepository implements IPodReportRepository {
  async saveReport(report: PodReport): Promise<void> {
    await db.transaction(async (tx) => {
      // Replace semantics: delete any existing report for this source document (cascades to
      // its sections/children) before inserting the new tree, so a reprocess never accumulates
      // duplicate rows and a partial tree is never observable between the two steps.
      await tx.delete(podReports).where(and(
        eq(podReports.sourceDocumentId, report.sourceDocumentId),
        eq(podReports.tenantId, report.tenantId)
      ));

      await tx.insert(podReports).values({
        id: report.id,
        sourceDocumentId: report.sourceDocumentId,
        projectId: report.projectId,
        tenantId: report.tenantId,
        reportDate: report.reportDate,
        title: report.title,
      });

      for (const section of report.sections) {
        const sectionId = randomUUID();

        await tx.insert(podSections).values({
          id: sectionId,
          reportId: report.id,
          sequence: section.sequence,
          crewNumber: section.crewNumber ?? null,
          label: section.label,
          category: section.category ?? null,
          trucking: section.trucking ?? null,
          traffic: section.traffic ?? null,
          notes: section.notes ?? null,
        });

        if (section.crewMembers.length > 0) {
          await tx.insert(podCrewMembers).values(
            section.crewMembers.map(member => ({
              id: randomUUID(),
              sectionId,
              sequence: member.sequence,
              name: member.name,
              workerId: member.workerId ?? null,
            }))
          );
        }

        if (section.equipment.length > 0) {
          await tx.insert(podEquipment).values(
            section.equipment.map(item => ({
              id: randomUUID(),
              sectionId,
              sequence: item.sequence,
              name: item.name,
              isRental: item.isRental,
            }))
          );
        }

        if (section.taskLines.length > 0) {
          await tx.insert(podTaskLines).values(
            section.taskLines.map(line => ({
              id: randomUUID(),
              sectionId,
              sequence: line.sequence,
              description: line.description,
              costCode: line.costCode ?? null,
            }))
          );
        }
      }
    });
  }

  async deleteBySourceDocumentId(sourceDocumentId: string, tenantId: string): Promise<void> {
    await db.delete(podReports).where(and(
      eq(podReports.sourceDocumentId, sourceDocumentId),
      eq(podReports.tenantId, tenantId)
    ));
  }
}
