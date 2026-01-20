export interface AITokenUsageProps {
  id?: string;
  projectId: string;
  runId: string;
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

export class AITokenUsage {
  public readonly id: string;
  public readonly projectId: string;
  public readonly runId: string;
  public readonly operation: string;
  public readonly model: string;
  public readonly inputTokens: number;
  public readonly outputTokens: number;
  public readonly totalTokens: number;
  public readonly estimatedCostUsd: number;
  public readonly metadata: Record<string, unknown>;
  public readonly createdAt: Date;

  private constructor(props: AITokenUsageProps) {
    this.id = props.id || crypto.randomUUID();
    this.projectId = props.projectId;
    this.runId = props.runId;
    this.operation = props.operation;
    this.model = props.model;
    this.inputTokens = props.inputTokens;
    this.outputTokens = props.outputTokens;
    this.totalTokens = props.totalTokens;
    this.estimatedCostUsd = props.estimatedCostUsd;
    this.metadata = props.metadata || {};
    this.createdAt = props.createdAt || new Date();
  }

  static create(props: AITokenUsageProps): AITokenUsage {
    if (props.inputTokens < 0 || props.outputTokens < 0) {
      throw new Error('Token counts cannot be negative');
    }
    if (!props.runId || props.runId.trim().length === 0) {
      throw new Error('runId is required');
    }
    return new AITokenUsage(props);
  }

  static fromPersistence(data: AITokenUsageProps): AITokenUsage {
    return new AITokenUsage(data);
  }

  static calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-5.2': { input: 0.01, output: 0.03 },
      'gpt-5.2-high': { input: 0.01, output: 0.03 },
      'claude-sonnet-4-5': { input: 0.003, output: 0.015 },
      'claude-opus-4-5': { input: 0.015, output: 0.075 },
    };

    const modelPricing = pricing[model] || { input: 0.01, output: 0.03 };
    const inputCost = (inputTokens / 1000) * modelPricing.input;
    const outputCost = (outputTokens / 1000) * modelPricing.output;
    
    return Math.round((inputCost + outputCost) * 1000000) / 1000000;
  }
}
