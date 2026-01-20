export interface AgentSummary {
  id: string;
  name: string;
  description: string;
}

export interface IAgentDiscoveryService {
  discoverAgents(tenantId: string): Promise<AgentSummary[]>;
}
