import type { SendDelayEventsChatQuery } from '../SendDelayEventsChatQuery';
import type { DelayEventsChatResponseDto } from '../../dto/DelayEventsChatDto';
import type { IContractorDelayEventRepository } from '../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import type { IDelayEventsChatService } from '../../../../domain/delay-analysis/interfaces/IDelayEventsChatService';
import type { IDocumentContentProvider } from '../../../../domain/delay-analysis/interfaces/IDocumentContentProvider';

export class SendDelayEventsChatQueryHandler {
  constructor(
    private readonly delayEventRepository: IContractorDelayEventRepository,
    private readonly chatService: IDelayEventsChatService,
    private readonly documentContentProvider?: IDocumentContentProvider
  ) {}

  async handle(query: SendDelayEventsChatQuery): Promise<DelayEventsChatResponseDto> {
    const delayEvents = await this.delayEventRepository.findByProjectId(
      query.projectId,
      query.tenantId
    );

    let sourceDocuments;
    if (this.documentContentProvider) {
      const sourceDocumentIds = delayEvents
        .filter(e => e.sourceDocumentId)
        .map(e => e.sourceDocumentId!);

      if (sourceDocumentIds.length > 0) {
        sourceDocuments = await this.documentContentProvider.getDocumentsByIds(
          sourceDocumentIds,
          query.tenantId
        );
      }
    }

    const chatResponse = await this.chatService.chat({
      projectId: query.projectId,
      tenantId: query.tenantId,
      userMessage: query.userMessage,
      conversationHistory: query.conversationHistory,
      delayEvents,
      sourceDocuments,
    });

    return {
      response: chatResponse.response,
      isRefusal: chatResponse.isRefusal,
    };
  }
}
