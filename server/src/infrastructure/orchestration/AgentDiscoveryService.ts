import { eq } from 'drizzle-orm';
import type { IAgentDiscoveryService, AgentSummary } from '../../domain/interfaces/IAgentDiscoveryService';
import { agents } from '@shared/schema';
import { db } from '../database';

export class AgentDiscoveryService implements IAgentDiscoveryService {
  async discoverAgents(tenantId: string): Promise<AgentSummary[]> {
    const result = await db
      .select({
        id: agents.id,
        name: agents.name,
        description: agents.description,
      })
      .from(agents)
      .where(eq(agents.tenantId, tenantId));

    return result.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
    }));
  }
}
