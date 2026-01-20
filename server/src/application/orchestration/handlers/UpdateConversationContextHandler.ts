import type { UpdateConversationContextCommand } from '../commands/UpdateConversationContextCommand';
import type { IConversationContextRepository } from '../../../domain/orchestration/interfaces/IConversationContextRepository';
import { ConversationContext } from '../../../domain/orchestration/value-objects/ConversationContext';

export class UpdateConversationContextHandler {
  constructor(
    private readonly contextRepository: IConversationContextRepository
  ) {}

  async handle(command: UpdateConversationContextCommand): Promise<void> {
    let context = await this.contextRepository.findByConversationId(
      command.conversationId,
      command.tenantId
    );

    if (!context) {
      context = ConversationContext.create(command.conversationId, command.tenantId);
    }

    context.setPackageContext(command.packageId, command.packageName, command.s3Path);

    if (await this.contextRepository.findByConversationId(command.conversationId, command.tenantId)) {
      await this.contextRepository.update(context);
    } else {
      await this.contextRepository.save(context);
    }
  }
}
