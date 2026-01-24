import type { ContractorDelayEvent } from '../entities/ContractorDelayEvent';

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
}

export interface DelayEventsChatResponse {
  response: string;
  isRefusal: boolean;
}

export interface IDelayEventsChatService {
  chat(request: DelayEventsChatRequest): Promise<DelayEventsChatResponse>;
}
