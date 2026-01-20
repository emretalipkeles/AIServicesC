import type { IQueryHandler } from '../../interfaces/IQueryBus';
import type { TestConnectionQuery } from '../TestConnectionQuery';
import type { TestConnectionResponseDto } from '../../dto/AIDto';
import type { IAIClient } from '../../../domain/interfaces/IAIClient';
import { ModelId } from '../../../domain/value-objects/ModelId';

export interface IAIClientProvider {
  getClient(tenantId?: string): IAIClient | null;
}

export class TestConnectionQueryHandler implements IQueryHandler<TestConnectionQuery, TestConnectionResponseDto> {
  constructor(private readonly clientProvider: IAIClientProvider) {}

  async handle(query: TestConnectionQuery): Promise<TestConnectionResponseDto> {
    const client = this.clientProvider.getClient(query.tenantId);
    
    if (!client) {
      return {
        success: false,
        authMethod: 'api-key',
        model: query.model,
        latencyMs: 0,
        error: 'AI client not configured for tenant',
      };
    }

    const model = ModelId.fromName(query.model);
    const result = await client.testConnection(model);

    return {
      success: result.success,
      authMethod: result.authMethod,
      model: result.model,
      latencyMs: result.latencyMs,
      error: result.error,
    };
  }
}
