import type { IAIClient } from '../../domain/interfaces/IAIClient';
import { BedrockApiKeyClient } from './BedrockApiKeyClient';
import { BedrockIamClient } from './BedrockIamClient';

export interface BedrockCredentials {
  region: string;
  apiKey?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export type AuthMethod = 'api-key' | 'iam' | 'none';

export class BedrockClientFactory {
  static detectAuthMethod(credentials: BedrockCredentials): AuthMethod {
    if (credentials.apiKey) {
      return 'api-key';
    }
    
    if (credentials.accessKeyId && credentials.secretAccessKey) {
      return 'iam';
    }
    
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      return 'iam';
    }
    
    return 'none';
  }

  static create(credentials: BedrockCredentials): IAIClient | null {
    const authMethod = this.detectAuthMethod(credentials);
    
    switch (authMethod) {
      case 'api-key':
        return new BedrockApiKeyClient({
          region: credentials.region,
          apiKey: credentials.apiKey!,
        });
        
      case 'iam':
        return new BedrockIamClient({
          region: credentials.region,
          accessKeyId: credentials.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: credentials.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY,
          sessionToken: credentials.sessionToken ?? process.env.AWS_SESSION_TOKEN,
        });
        
      default:
        return null;
    }
  }

  static createFromEnvironment(): IAIClient | null {
    const region = process.env.AWS_BEDROCK_REGION ?? 'us-east-1';
    const apiKey = process.env.AWS_BEDROCK_API_KEY;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const sessionToken = process.env.AWS_SESSION_TOKEN;

    return this.create({
      region,
      apiKey,
      accessKeyId,
      secretAccessKey,
      sessionToken,
    });
  }

  static isConfigured(): boolean {
    const region = process.env.AWS_BEDROCK_REGION;
    const apiKey = process.env.AWS_BEDROCK_API_KEY;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    return !!(region && (apiKey || (accessKeyId && secretAccessKey)));
  }

  static getConfiguredAuthMethod(): AuthMethod {
    return this.detectAuthMethod({
      region: process.env.AWS_BEDROCK_REGION ?? '',
      apiKey: process.env.AWS_BEDROCK_API_KEY,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });
  }
}

export function getBedrockClient(): IAIClient | null {
  return BedrockClientFactory.createFromEnvironment();
}
