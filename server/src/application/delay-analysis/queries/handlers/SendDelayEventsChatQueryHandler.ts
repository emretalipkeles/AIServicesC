import type { SendDelayEventsChatQuery } from '../SendDelayEventsChatQuery';
import type { DelayEventsChatResponseDto } from '../../dto/DelayEventsChatDto';
import type { IContractorDelayEventRepository } from '../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import type { IDelayEventsChatService } from '../../../../domain/delay-analysis/interfaces/IDelayEventsChatService';

export class SendDelayEventsChatQueryHandler {
  constructor(
    private readonly delayEventRepository: IContractorDelayEventRepository,
    private readonly chatService: IDelayEventsChatService
  ) {}

  async handle(query: SendDelayEventsChatQuery): Promise<DelayEventsChatResponseDto> {
    const delayEvents = await this.delayEventRepository.findByProjectId(
      query.projectId,
      query.tenantId
    );

    const chatResponse = await this.chatService.chat({
      projectId: query.projectId,
      tenantId: query.tenantId,
      userMessage: query.userMessage,
      conversationHistory: query.conversationHistory,
      delayEvents,
    });

    return {
      response: chatResponse.response,
      isRefusal: chatResponse.isRefusal,
    };
  }
}
