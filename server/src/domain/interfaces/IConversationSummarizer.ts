import type { ConversationMessageEntity } from './IConversationRepository';

export interface PretContextSummary {
  packageId?: string;
  packageName?: string;
  activeModelName?: string;
  loadedFiles: string[];
}

export interface ConversationSummary {
  content: string;
  originalMessageCount: number;
  keyPoints: string[];
  agentInteractions: Array<{
    agentName: string;
    action: string;
    outcome: string;
  }>;
  pretContext?: PretContextSummary;
}

export interface IConversationSummarizer {
  summarize(messages: ConversationMessageEntity[]): Promise<ConversationSummary>;
  
  shouldOptimize(messageCount: number, threshold?: number): boolean;
}
