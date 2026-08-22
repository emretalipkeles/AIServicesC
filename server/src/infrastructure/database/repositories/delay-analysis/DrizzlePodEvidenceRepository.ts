import { and, eq, gte, lte, inArray } from 'drizzle-orm';
import type { IPodEvidenceProvider } from '../../../../domain/delay-analysis/interfaces/IPodEvidenceProvider';
import { toPodEvidenceDateKey } from '../../../../domain/delay-analysis/interfaces/IPodEvidenceProvider';
import { PodReport, type PodSection } from '../../../../domain/delay-analysis/entities/PodReport';
import {
  podReports,
  podSections,
  podCrewMembers,
  podEquipment,
  podTaskLines,
} from '@shared/schema';
import { db } from '../../../database';

/**
 * Read-side POD repository for delay analysis. Deliberately separate from
 * IPodReportRepository (the write side owned by upload/extraction) per CQRS: analysis only
 * ever needs "give me evidence for these dates", never save/delete. Loads a whole date range
 * in one call so a batch analysis run can resolve POD evidence once and reuse it across every
 * document/event, instead of querying per delay event (database-efficiency rule).
 */
export class DrizzlePodEvidenceRepository implements IPodEvidenceProvider {
  async getEvidenceForDateRange(
    projectId: string,
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, PodReport[]>> {
    const reportRows = await db
      .select()
      .from(podReports)
      .where(and(
        eq(podReports.projectId, projectId),
        eq(podReports.tenantId, tenantId),
        gte(podReports.reportDate, startDate),
        lte(podReports.reportDate, endDate)
      ));

    const result = new Map<string, PodReport[]>();
    if (reportRows.length === 0) {
      return result;
    }

    const reportIds = reportRows.map(row => row.id);

    const sectionRows = await db.select().from(podSections).where(inArray(podSections.reportId, reportIds));
    const sectionIds = sectionRows.map(row => row.id);

    const [crewRows, equipmentRows, taskLineRows] = sectionIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          db.select().from(podCrewMembers).where(inArray(podCrewMembers.sectionId, sectionIds)),
          db.select().from(podEquipment).where(inArray(podEquipment.sectionId, sectionIds)),
          db.select().from(podTaskLines).where(inArray(podTaskLines.sectionId, sectionIds)),
        ]);

    const sectionsByReportId = new Map<string, typeof sectionRows>();
    for (const section of sectionRows) {
      const list = sectionsByReportId.get(section.reportId) ?? [];
      list.push(section);
      sectionsByReportId.set(section.reportId, list);
    }

    const crewBySectionId = groupBySectionId(crewRows);
    const equipmentBySectionId = groupBySectionId(equipmentRows);
    const taskLinesBySectionId = groupBySectionId(taskLineRows);

    for (const reportRow of reportRows) {
      if (!reportRow.reportDate) continue;

      const sections: PodSection[] = (sectionsByReportId.get(reportRow.id) ?? [])
        .slice()
        .sort((a, b) => a.sequence - b.sequence)
        .map(sectionRow => ({
          sequence: sectionRow.sequence,
          crewNumber: sectionRow.crewNumber,
          label: sectionRow.label,
          category: sectionRow.category,
          trucking: sectionRow.trucking,
          traffic: sectionRow.traffic,
          notes: sectionRow.notes,
          crewMembers: (crewBySectionId.get(sectionRow.id) ?? [])
            .slice()
            .sort((a, b) => a.sequence - b.sequence)
            .map(row => ({ sequence: row.sequence, name: row.name, workerId: row.workerId })),
          equipment: (equipmentBySectionId.get(sectionRow.id) ?? [])
            .slice()
            .sort((a, b) => a.sequence - b.sequence)
            .map(row => ({ sequence: row.sequence, name: row.name, isRental: row.isRental })),
          taskLines: (taskLinesBySectionId.get(sectionRow.id) ?? [])
            .slice()
            .sort((a, b) => a.sequence - b.sequence)
            .map(row => ({ sequence: row.sequence, description: row.description, costCode: row.costCode })),
        }));

      const podReport = new PodReport({
        id: reportRow.id,
        sourceDocumentId: reportRow.sourceDocumentId,
        projectId: reportRow.projectId,
        tenantId: reportRow.tenantId,
        reportDate: reportRow.reportDate,
        title: reportRow.title,
        sections,
      });

      const dateKey = toPodEvidenceDateKey(reportRow.reportDate);
      const list = result.get(dateKey) ?? [];
      list.push(podReport);
      result.set(dateKey, list);
    }

    return result;
  }
}

function groupBySectionId<T extends { sectionId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.sectionId) ?? [];
    list.push(row);
    map.set(row.sectionId, list);
  }
  return map;
}
