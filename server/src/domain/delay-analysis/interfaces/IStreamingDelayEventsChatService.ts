import type { ContractorDelayEvent } from '../entities/ContractorDelayEvent';
import type { DocumentContentSummary } from './IDocumentContentProvider';
import type { IChatToolExecutor } from './IChatToolExecutor';

export type ChatProgressStage = 
  | 'analyzing'
  | 'searching_events'
  | 'fetching_document'
  | 'processing_tool'
  | 'generating_response';

export interface ChatProgressEvent {
  type: 'progress';
  stage: ChatProgressStage;
  message: string;
  details?: {
    documentId?: string;
    documentName?: string;
    toolName?: string;
  };
}

export interface ChatContentEvent {
  type: 'content';
  content: string;
}

export interface ChatDoneEvent {
  type: 'done';
  isRefusal?: boolean;
}

export interface ChatErrorEvent {
  type: 'error';
  message: string;
}

export type StreamingChatEvent = 
  | ChatProgressEvent 
  | ChatContentEvent 
  | ChatDoneEvent 
  | ChatErrorEvent;

export interface StreamingDelayEventsChatRequest {
  projectId: string;
  tenantId: string;
  userMessage: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  delayEvents: ContractorDelayEvent[];
  sourceDocuments?: Map<string, DocumentContentSummary>;
}

export interface StreamingDelayEventsChatOptions {
  toolExecutor?: IChatToolExecutor;
}

export interface IStreamingDelayEventsChatService {
  streamChat(
    request: StreamingDelayEventsChatRequest,
    onEvent: (event: StreamingChatEvent) => void,
    options?: StreamingDelayEventsChatOptions
  ): Promise<void>;
}
