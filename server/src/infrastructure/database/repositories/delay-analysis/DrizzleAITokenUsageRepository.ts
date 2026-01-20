import { eq } from 'drizzle-orm';
import { db } from '../../../database';
import { aiTokenUsage, type AITokenUsageRecord } from '@shared/schema';
import type { IAITokenUsageRepository, TokenUsageSummary, RunTokenUsageSummary } from '../../../../domain/delay-analysis/repositories/IAITokenUsageRepository';
import { AITokenUsage } from '../../../../domain/delay-analysis/entities/AITokenUsage';

export class DrizzleAITokenUsageRepository implements IAITokenUsageRepository {
  async save(usage: AITokenUsage): Promise<void> {
    await db.insert(aiTokenUsage).values({
      id: usage.id,
      projectId: usage.projectId,
      runId: usage.runId,
      operation: usage.operation,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedCostUsd: usage.estimatedCostUsd.toString(),
      metadata: usage.metadata,
    });
  }

  async findByProjectId(projectId: string): Promise<AITokenUsage[]> {
    const records = await db
      .select()
      .from(aiTokenUsage)
      .where(eq(aiTokenUsage.projectId, projectId))
      .orderBy(aiTokenUsage.createdAt);

    return this.mapRecordsToEntities(records);
  }

  async findByRunId(runId: string): Promise<AITokenUsage[]> {
    const records = await db
      .select()
      .from(aiTokenUsage)
      .where(eq(aiTokenUsage.runId, runId))
      .orderBy(aiTokenUsage.createdAt);

    return this.mapRecordsToEntities(records);
  }

  async getProjectSummary(projectId: string): Promise<TokenUsageSummary> {
    const records = await this.findByProjectId(projectId);
    return this.buildSummary(records);
  }

  async getRunSummary(runId: string): Promise<RunTokenUsageSummary | null> {
    const records = await this.findByRunId(runId);
    
    if (records.length === 0) {
      return null;
    }

    const baseSummary = this.buildSummary(records);
    const sortedByTime = [...records].sort((a, b) => 
      a.createdAt.getTime() - b.createdAt.getTime()
    );

    return {
      ...baseSummary,
      runId,
      projectId: records[0].projectId,
      startedAt: sortedByTime[0].createdAt,
      endedAt: sortedByTime[sortedByTime.length - 1].createdAt,
    };
  }

  async getTotalUsage(): Promise<TokenUsageSummary> {
    const records = await db.select().from(aiTokenUsage);
    const usages = this.mapRecordsToEntities(records);
    return this.buildSummary(usages);
  }

  private mapRecordsToEntities(records: AITokenUsageRecord[]): AITokenUsage[] {
    return records.map((record: AITokenUsageRecord) => AITokenUsage.fromPersistence({
      id: record.id,
      projectId: record.projectId,
      runId: record.runId,
      operation: record.operation,
      model: record.model,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      totalTokens: record.totalTokens,
      estimatedCostUsd: parseFloat(record.estimatedCostUsd),
      metadata: record.metadata as Record<string, unknown> || {},
      createdAt: record.createdAt || undefined,
    }));
  }

  private buildSummary(records: AITokenUsage[]): TokenUsageSummary {
    const operationBreakdown: TokenUsageSummary['operationBreakdown'] = {};

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;

    for (const record of records) {
      totalInputTokens += record.inputTokens;
      totalOutputTokens += record.outputTokens;
      totalTokens += record.totalTokens;
      totalCostUsd += record.estimatedCostUsd;

      if (!operationBreakdown[record.operation]) {
        operationBreakdown[record.operation] = {
          count: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        };
      }

      operationBreakdown[record.operation].count += 1;
      operationBreakdown[record.operation].inputTokens += record.inputTokens;
      operationBreakdown[record.operation].outputTokens += record.outputTokens;
      operationBreakdown[record.operation].costUsd += record.estimatedCostUsd;
    }

    return {
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      totalCostUsd: Math.round(totalCostUsd * 1000000) / 1000000,
      operationBreakdown,
    };
  }
}
