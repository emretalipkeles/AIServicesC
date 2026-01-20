import { db } from '../../database';
import { conversations, conversationMessages } from '@shared/schema';
import type { 
  IConversationRepository, 
  ConversationEntity, 
  ConversationMessageEntity, 
  CreateConversationDTO, 
  CreateMessageDTO,
  ConversationRole
} from '../../../domain/interfaces/IConversationRepository';
import { eq, and, desc, asc, inArray, sql } from 'drizzle-orm';

function toConversationEntity(row: typeof conversations.$inferSelect): ConversationEntity {
  return {
    id: row.id,
    tenantId: row.tenantId,
    title: row.title,
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  };
}

function toMessageEntity(row: typeof conversationMessages.$inferSelect): ConversationMessageEntity {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as ConversationRole,
    content: row.content,
    metadata: row.metadata,
    createdAt: row.createdAt ?? new Date(),
  };
}

export class DrizzleConversationRepository implements IConversationRepository {
  async createConversation(data: CreateConversationDTO): Promise<ConversationEntity> {
    const [conversation] = await db
      .insert(conversations)
      .values(data)
      .returning();
    return toConversationEntity(conversation);
  }

  async getConversationById(id: string, tenantId: string): Promise<ConversationEntity | null> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)))
      .limit(1);
    return conversation ? toConversationEntity(conversation) : null;
  }

  async updateConversationTitle(id: string, tenantId: string, title: string): Promise<void> {
    await db
      .update(conversations)
      .set({ title, updatedAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)));
  }

  async addMessage(data: CreateMessageDTO, tenantId: string): Promise<ConversationMessageEntity> {
    const conversation = await this.getConversationById(data.conversationId, tenantId);
    if (!conversation) {
      throw new Error(`Conversation ${data.conversationId} not found for tenant ${tenantId}`);
    }

    const [message] = await db
      .insert(conversationMessages)
      .values(data)
      .returning();
    
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(and(eq(conversations.id, data.conversationId), eq(conversations.tenantId, tenantId)));
    
    return toMessageEntity(message);
  }

  async getMessages(conversationId: string, tenantId: string, limit?: number): Promise<ConversationMessageEntity[]> {
    const conversation = await this.getConversationById(conversationId, tenantId);
    if (!conversation) {
      return [];
    }

    if (limit) {
      const messages = await db
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.conversationId, conversationId))
        .orderBy(desc(conversationMessages.createdAt))
        .limit(limit);
      return messages.reverse().map(toMessageEntity);
    }
    
    const messages = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(asc(conversationMessages.createdAt));
    
    return messages.map(toMessageEntity);
  }

  async getMessageCount(conversationId: string, tenantId: string): Promise<number> {
    const conversation = await this.getConversationById(conversationId, tenantId);
    if (!conversation) {
      return 0;
    }

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId));
    return result[0]?.count || 0;
  }

  async deleteOldMessages(conversationId: string, tenantId: string, keepCount: number): Promise<number> {
    const conversation = await this.getConversationById(conversationId, tenantId);
    if (!conversation) {
      return 0;
    }

    const messagesToKeep = await db
      .select({ id: conversationMessages.id })
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(desc(conversationMessages.createdAt))
      .limit(keepCount);
    
    const keepIds = messagesToKeep.map((m: { id: string }) => m.id);
    
    if (keepIds.length === 0) return 0;
    
    const result = await db
      .delete(conversationMessages)
      .where(
        and(
          eq(conversationMessages.conversationId, conversationId),
          sql`${conversationMessages.id} NOT IN (${sql.join(keepIds.map(id => sql`${id}`), sql`, `)})`
        )
      )
      .returning();
    
    return result.length;
  }

  async replaceMessagesWithSummary(
    conversationId: string,
    tenantId: string,
    messageIdsToReplace: string[],
    summaryContent: string,
    metadata: string
  ): Promise<void> {
    if (messageIdsToReplace.length === 0) return;

    const conversation = await this.getConversationById(conversationId, tenantId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found for tenant ${tenantId}`);
    }
    
    await db.transaction(async (tx) => {
      await tx
        .delete(conversationMessages)
        .where(
          and(
            eq(conversationMessages.conversationId, conversationId),
            inArray(conversationMessages.id, messageIdsToReplace)
          )
        );
      
      await tx.insert(conversationMessages).values({
        conversationId,
        role: 'summary',
        content: summaryContent,
        metadata,
      });
    });
  }
}
