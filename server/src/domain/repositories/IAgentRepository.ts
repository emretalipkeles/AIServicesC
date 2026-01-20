import type { Agent } from '../entities/Agent';

export interface IAgentRepository {
  findById(id: string, tenantId: string): Promise<Agent | null>;
  findAll(tenantId: string): Promise<Agent[]>;
  save(agent: Agent): Promise<void>;
  update(agent: Agent): Promise<void>;
  delete(id: string, tenantId: string): Promise<void>;
}
