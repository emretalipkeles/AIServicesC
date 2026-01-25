import type { ContractorDelayEvent } from '../entities/ContractorDelayEvent';
import type { DocumentContentSummary } from './IDocumentContentProvider';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface DelayEventsChatRequest {
  projectId: string;
  tenantId: string;
  userMessage: string;
  conversationHistory: ChatMessage[];
  delayEvents: ContractorDelayEvent[];
  sourceDocuments?: Map<string, DocumentContentSummary>;
}

export interface DelayEventsChatResponse {
  response: string;
  isRefusal: boolean;
}

export interface IDelayEventsChatService {
  chat(request: DelayEventsChatRequest): Promise<DelayEventsChatResponse>;
}
