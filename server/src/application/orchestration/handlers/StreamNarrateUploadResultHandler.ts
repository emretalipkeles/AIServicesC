import type { IUploadNarrator, NarratorStreamChunk, NarratorStreamOptions } from '../../../domain/orchestration/interfaces/IUploadNarrator';
import type { IConversationRepository } from '../../../domain/interfaces/IConversationRepository';
import type { IConversationContextRepository } from '../../../domain/orchestration/interfaces/IConversationContextRepository';
import { ConversationContext } from '../../../domain/orchestration/value-objects/ConversationContext';
import { StreamNarrateUploadResultCommand } from '../commands/StreamNarrateUploadResultCommand';

export interface StreamNarratorOptions extends NarratorStreamOptions {
  abortSignal?: AbortSignal;
}

export interface StreamNarratorResult {
  fullContent: string;
  conversationId?: string;
}

export class StreamNarrateUploadResultHandler {
  constructor(
    private readonly narrator: IUploadNarrator,
    private readonly conversationRepository?: IConversationRepository,
    private readonly conversationContextRepository?: IConversationContextRepository
  ) {}

  async handleStream(
    command: StreamNarrateUploadResultCommand,
    onChunk: (chunk: NarratorStreamChunk) => void,
    options?: StreamNarratorOptions
  ): Promise<StreamNarratorResult> {
    let activeConversationId = command.conversationId;

    if (this.conversationRepository) {
      if (!activeConversationId) {
        try {
          const newConversation = await this.conversationRepository.createConversation({ 
            tenantId: command.tenantId 
          });
          activeConversationId = newConversation.id;
          console.log('[StreamNarrateUploadResultHandler] Created new conversation:', activeConversationId);
        } catch (err) {
          console.error('[StreamNarrateUploadResultHandler] Failed to create conversation:', err);
        }
      }

      if (activeConversationId) {
        try {
          await this.conversationRepository.addMessage({
            conversationId: activeConversationId,
            role: 'user',
            content: `Uploading package: ${command.packageName}`,
          }, command.tenantId);
        } catch (err) {
          console.error('[StreamNarrateUploadResultHandler] Failed to save user message:', err);
        }
      }
    }

    let fullContent = '';

    await this.narrator.streamNarrate(
      {
        success: command.success,
        packageName: command.packageName,
        packageId: command.packageId,
        error: command.error,
        validationErrors: command.validationErrors,
      },
      (chunk) => {
        if (chunk.type === 'content' && chunk.content) {
          fullContent += chunk.content;
        }
        onChunk(chunk);
      },
      { abortSignal: options?.abortSignal }
    );

    if (activeConversationId && this.conversationRepository) {
      try {
        const messageToSave = fullContent || (command.success
          ? `PRET package "${command.packageName}" has been successfully uploaded and is ready for use.`
          : `Failed to upload PRET package "${command.packageName}": ${command.error || 'Unknown error'}`);
        
        await this.conversationRepository.addMessage({
          conversationId: activeConversationId,
          role: 'assistant',
          content: messageToSave,
        }, command.tenantId);
      } catch (err) {
        console.error('[StreamNarrateUploadResultHandler] Failed to save assistant message:', err);
      }
    }

    if (command.success && activeConversationId && this.conversationContextRepository) {
      try {
        let context = await this.conversationContextRepository.findByConversationId(
          activeConversationId,
          command.tenantId
        );

        if (!context) {
          context = ConversationContext.create(activeConversationId, command.tenantId);
        }

        const s3Path = `pret-packages/${command.tenantId}/${command.packageId}`;
        context.setPackageContext(command.packageId, command.packageName, s3Path);
        
        await this.conversationContextRepository.save(context);
        console.log('[StreamNarrateUploadResultHandler] Set package context for conversation:', activeConversationId, 'packageId:', command.packageId);
      } catch (err) {
        console.error('[StreamNarrateUploadResultHandler] Failed to set package context:', err);
      }
    }

    return { fullContent, conversationId: activeConversationId };
  }
}
