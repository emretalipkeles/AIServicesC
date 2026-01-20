export type ConversationRole = 'user' | 'assistant' | 'agent_interaction' | 'summary';

export interface ConversationEntity {
  id: string;
  tenantId: string;
  title?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessageEntity {
  id: string;
  conversationId: string;
  role: ConversationRole;
  content: string;
  metadata?: string | null;
  createdAt: Date;
}

export interface CreateConversationDTO {
  tenantId: string;
  title?: string;
}

export interface CreateMessageDTO {
  conversationId: string;
  role: ConversationRole;
  content: string;
  metadata?: string;
}

export interface IConversationRepository {
  createConversation(data: CreateConversationDTO): Promise<ConversationEntity>;
  
  getConversationById(id: string, tenantId: string): Promise<ConversationEntity | null>;
  
  updateConversationTitle(id: string, tenantId: string, title: string): Promise<void>;
  
  addMessage(data: CreateMessageDTO, tenantId: string): Promise<ConversationMessageEntity>;
  
  getMessages(conversationId: string, tenantId: string, limit?: number): Promise<ConversationMessageEntity[]>;
  
  getMessageCount(conversationId: string, tenantId: string): Promise<number>;
  
  deleteOldMessages(conversationId: string, tenantId: string, keepCount: number): Promise<number>;
  
  replaceMessagesWithSummary(
    conversationId: string,
    tenantId: string,
    messageIdsToReplace: string[],
    summaryContent: string,
    metadata: string
  ): Promise<void>;
}
