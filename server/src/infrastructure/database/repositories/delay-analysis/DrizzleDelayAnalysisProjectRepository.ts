import { eq, and } from 'drizzle-orm';
import type { IDelayAnalysisProjectRepository } from '../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import { DelayAnalysisProject } from '../../../../domain/delay-analysis/entities/DelayAnalysisProject';
import { delayAnalysisProjects } from '@shared/schema';
import { db } from '../../../database';

export class DrizzleDelayAnalysisProjectRepository implements IDelayAnalysisProjectRepository {
  async findById(id: string, tenantId: string): Promise<DelayAnalysisProject | null> {
    const result = await db
      .select()
      .from(delayAnalysisProjects)
      .where(and(eq(delayAnalysisProjects.id, id), eq(delayAnalysisProjects.tenantId, tenantId)))
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0];
    return new DelayAnalysisProject({
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      description: row.description,
      contractNumber: row.contractNumber,
      noticeToProceedDate: row.noticeToProceedDate,
      status: row.status,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    });
  }

  async findAll(tenantId: string): Promise<DelayAnalysisProject[]> {
    const result = await db
      .select()
      .from(delayAnalysisProjects)
      .where(eq(delayAnalysisProjects.tenantId, tenantId));

    return result.map(row => new DelayAnalysisProject({
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      description: row.description,
      contractNumber: row.contractNumber,
      noticeToProceedDate: row.noticeToProceedDate,
      status: row.status,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    }));
  }

  async save(project: DelayAnalysisProject): Promise<void> {
    await db.insert(delayAnalysisProjects).values({
      id: project.id,
      tenantId: project.tenantId,
      name: project.name,
      description: project.description,
      contractNumber: project.contractNumber,
      noticeToProceedDate: project.noticeToProceedDate,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
  }

  async update(project: DelayAnalysisProject): Promise<void> {
    await db
      .update(delayAnalysisProjects)
      .set({
        name: project.name,
        description: project.description,
        contractNumber: project.contractNumber,
        noticeToProceedDate: project.noticeToProceedDate,
        status: project.status,
        updatedAt: project.updatedAt,
      })
      .where(and(
        eq(delayAnalysisProjects.id, project.id), 
        eq(delayAnalysisProjects.tenantId, project.tenantId)
      ));
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await db
      .delete(delayAnalysisProjects)
      .where(and(eq(delayAnalysisProjects.id, id), eq(delayAnalysisProjects.tenantId, tenantId)));
  }
}
