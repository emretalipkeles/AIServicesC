import type { IAIClient } from '../../domain/interfaces/IAIClient';
import type { ModelId } from '../../domain/value-objects/ModelId';
import { BedrockClientFactory } from './BedrockClientFactory';
import { OpenAIResponsesClient } from './OpenAIResponsesClient';

export interface IAIClientFactory {
  getClientForModel(model: ModelId): IAIClient | null;
  isConfigured(model: ModelId): boolean;
}

export class AIClientFactory implements IAIClientFactory {
  private bedrockClient: IAIClient | null = null;
  private openAIClient: IAIClient | null = null;
  private bedrockInitialized = false;
  private openAIInitialized = false;

  getClientForModel(model: ModelId): IAIClient | null {
    if (model.isBedrock()) {
      return this.getBedrockClient();
    }
    
    if (model.isOpenAI()) {
      return this.getOpenAIClient();
    }

    return null;
  }

  private getBedrockClient(): IAIClient | null {
    if (!this.bedrockInitialized) {
      this.bedrockClient = BedrockClientFactory.createFromEnvironment();
      this.bedrockInitialized = true;
    }
    return this.bedrockClient;
  }

  private getOpenAIClient(): IAIClient | null {
    if (!this.openAIInitialized) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        this.openAIClient = new OpenAIResponsesClient(apiKey);
      }
      this.openAIInitialized = true;
    }
    return this.openAIClient;
  }

  isConfigured(model: ModelId): boolean {
    if (model.isBedrock()) {
      return BedrockClientFactory.isConfigured();
    }
    
    if (model.isOpenAI()) {
      return !!process.env.OPENAI_API_KEY;
    }

    return false;
  }

  reset(): void {
    this.bedrockClient = null;
    this.openAIClient = null;
    this.bedrockInitialized = false;
    this.openAIInitialized = false;
  }
}

export const aiClientFactory = new AIClientFactory();
