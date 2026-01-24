export interface OrchestrationContext {
  activeDelayAnalysisProjectId?: string;
}

export class OrchestrateCommand {
  constructor(
    public readonly tenantId: string,
    public readonly message: string,
    public readonly conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    public readonly conversationId?: string,
    public readonly context?: OrchestrationContext
  ) {}
}
