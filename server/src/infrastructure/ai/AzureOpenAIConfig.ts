import { AzureOpenAI } from 'openai';

export interface AzureOpenAISettings {
  endpoint: string;
  apiKey: string;
  apiVersion: string;
  deployment: string;
}

export function getAzureOpenAISettings(): AzureOpenAISettings | null {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2025-04-01-preview';
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    return null;
  }

  return { endpoint, apiKey, apiVersion, deployment };
}

export function isAzureOpenAIConfigured(): boolean {
  return !!(
    process.env.AZURE_OPENAI_ENDPOINT &&
    process.env.AZURE_OPENAI_API_KEY &&
    process.env.AZURE_OPENAI_DEPLOYMENT
  );
}

export function createAzureOpenAIClient(settings: AzureOpenAISettings): AzureOpenAI {
  return new AzureOpenAI({
    endpoint: settings.endpoint,
    apiKey: settings.apiKey,
    apiVersion: settings.apiVersion,
    deployment: settings.deployment,
  });
}
