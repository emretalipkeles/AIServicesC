import { ValidationError } from '../errors/DomainError';

export type ModelProvider = 'bedrock' | 'openai';
export type ReasoningEffort = 'medium' | 'high';

export const BEDROCK_MODELS = {
  'claude-sonnet-4-5': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  'claude-opus-4-5': 'global.anthropic.claude-opus-4-5-20251101-v1:0',
} as const;

export const OPENAI_MODELS = {
  'gpt-5.4': 'gpt-5.4',
  'gpt-5.4-high': 'gpt-5.4',
} as const;

export const SUPPORTED_MODELS = {
  ...BEDROCK_MODELS,
  ...OPENAI_MODELS,
} as const;

export type BedrockModelName = keyof typeof BEDROCK_MODELS;
export type OpenAIModelName = keyof typeof OPENAI_MODELS;
export type ModelName = keyof typeof SUPPORTED_MODELS;
export type ModelInferenceId = typeof SUPPORTED_MODELS[ModelName];

export class ModelId {
  private readonly value: string;
  private readonly name: ModelName;
  private readonly provider: ModelProvider;
  private readonly reasoningEffort: ReasoningEffort;

  constructor(modelName: ModelName) {
    if (!SUPPORTED_MODELS[modelName]) {
      throw new ValidationError(`Unsupported model: ${modelName}. Supported models: ${Object.keys(SUPPORTED_MODELS).join(', ')}`);
    }
    this.name = modelName;
    this.value = SUPPORTED_MODELS[modelName];
    this.provider = this.detectProvider(modelName);
    this.reasoningEffort = this.detectReasoningEffort(modelName);
  }

  private detectProvider(modelName: ModelName): ModelProvider {
    if (modelName in BEDROCK_MODELS) {
      return 'bedrock';
    }
    return 'openai';
  }

  private detectReasoningEffort(modelName: ModelName): ReasoningEffort {
    if (modelName === 'gpt-5.4-high' || modelName === 'claude-opus-4-5') {
      return 'high';
    }
    return 'medium';
  }

  static fromName(name: ModelName): ModelId {
    return new ModelId(name);
  }

  private static readonly LEGACY_MODEL_ALIASES: Record<string, ModelName> = {
    'gpt-5.2': 'gpt-5.4',
    'gpt-5.2-high': 'gpt-5.4-high',
  };

  static fromString(name: string): ModelId {
    const resolved = ModelId.LEGACY_MODEL_ALIASES[name] ?? name;
    if (!(resolved in SUPPORTED_MODELS)) {
      throw new ValidationError(`Unsupported model: ${name}. Supported models: ${Object.keys(SUPPORTED_MODELS).join(', ')}`);
    }
    return new ModelId(resolved as ModelName);
  }

  static sonnet(): ModelId {
    return new ModelId('claude-sonnet-4-5');
  }

  static opus(): ModelId {
    return new ModelId('claude-opus-4-5');
  }

  static gpt54(): ModelId {
    return new ModelId('gpt-5.4');
  }

  static gpt54High(): ModelId {
    return new ModelId('gpt-5.4-high');
  }

  getValue(): string {
    return this.value;
  }

  getName(): ModelName {
    return this.name;
  }

  getProvider(): ModelProvider {
    return this.provider;
  }

  getReasoningEffort(): ReasoningEffort {
    return this.reasoningEffort;
  }

  isBedrock(): boolean {
    return this.provider === 'bedrock';
  }

  isOpenAI(): boolean {
    return this.provider === 'openai';
  }

  isGlobalProfile(): boolean {
    return this.value.startsWith('global.');
  }

  getAzureDeploymentName(): string {
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    if (!deployment) {
      throw new Error('AZURE_OPENAI_DEPLOYMENT environment variable is required for Azure OpenAI');
    }
    return deployment;
  }

  toString(): string {
    return this.value;
  }

  equals(other: ModelId): boolean {
    return this.name === other.name;
  }
}
