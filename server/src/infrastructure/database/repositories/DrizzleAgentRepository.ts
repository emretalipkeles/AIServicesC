import { eq, and } from 'drizzle-orm';
import type { IAgentRepository } from '../../../domain/repositories/IAgentRepository';
import { Agent } from '../../../domain/entities/Agent';
import { agents } from '@shared/schema';
import { db } from '../../database';

export class DrizzleAgentRepository implements IAgentRepository {
  async findById(id: string, tenantId: string): Promise<Agent | null> {
    const result = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, id), eq(agents.tenantId, tenantId)))
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0];
    return new Agent({
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      description: row.description,
      systemPrompt: row.systemPrompt,
      model: row.model,
      agentType: row.agentType ?? 'standard',
      allowedTables: row.allowedTables ?? [],
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    });
  }

  async findAll(tenantId: string): Promise<Agent[]> {
    const result = await db
      .select()
      .from(agents)
      .where(eq(agents.tenantId, tenantId));

    return result.map(row => new Agent({
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      description: row.description,
      systemPrompt: row.systemPrompt,
      model: row.model,
      agentType: row.agentType ?? 'standard',
      allowedTables: row.allowedTables ?? [],
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    }));
  }

  async save(agent: Agent): Promise<void> {
    await db.insert(agents).values({
      id: agent.id,
      tenantId: agent.tenantId,
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      agentType: agent.agentType,
      allowedTables: agent.allowedTables,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    });
  }

  async update(agent: Agent): Promise<void> {
    await db
      .update(agents)
      .set({
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        agentType: agent.agentType,
        allowedTables: agent.allowedTables,
        updatedAt: agent.updatedAt,
      })
      .where(and(eq(agents.id, agent.id), eq(agents.tenantId, agent.tenantId)));
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await db
      .delete(agents)
      .where(and(eq(agents.id, id), eq(agents.tenantId, tenantId)));
  }
}
