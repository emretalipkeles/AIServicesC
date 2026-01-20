import type { IAIClient } from '../../domain/interfaces/IAIClient';
import { BedrockClientFactory, type BedrockCredentials } from './BedrockClientFactory';

export interface IAIClientProvider {
  getClient(tenantId?: string): IAIClient | null;
  getClientWithCredentials(credentials: BedrockCredentials): IAIClient | null;
  isConfigured(): boolean;
}

export class BedrockClientProvider implements IAIClientProvider {
  private defaultClient: IAIClient | null = null;
  private initialized = false;
  private tenantClients: Map<string, IAIClient> = new Map();

  getClient(tenantId?: string): IAIClient | null {
    if (tenantId && this.tenantClients.has(tenantId)) {
      return this.tenantClients.get(tenantId)!;
    }

    if (!this.initialized) {
      this.defaultClient = BedrockClientFactory.createFromEnvironment();
      this.initialized = true;
    }
    return this.defaultClient;
  }

  getClientWithCredentials(credentials: BedrockCredentials): IAIClient | null {
    return BedrockClientFactory.create(credentials);
  }

  registerTenantClient(tenantId: string, credentials: BedrockCredentials): boolean {
    const client = BedrockClientFactory.create(credentials);
    if (client) {
      this.tenantClients.set(tenantId, client);
      return true;
    }
    return false;
  }

  removeTenantClient(tenantId: string): void {
    this.tenantClients.delete(tenantId);
  }

  isConfigured(): boolean {
    return BedrockClientFactory.isConfigured();
  }

  reset(): void {
    this.defaultClient = null;
    this.initialized = false;
    this.tenantClients.clear();
  }
}

export const bedrockClientProvider = new BedrockClientProvider();
