import type { ChatMessage } from '../../../domain/delay-analysis/interfaces/IDelayEventsChatService';

export class SendDelayEventsChatQuery {
  constructor(
    public readonly projectId: string,
    public readonly tenantId: string,
    public readonly userMessage: string,
    public readonly conversationHistory: ChatMessage[] = []
  ) {}
}
