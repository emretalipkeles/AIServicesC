import { BaseCommand } from '../interfaces/ICommandBus';

export class DeleteDocumentCommand extends BaseCommand {
  constructor(
    public readonly documentId: string,
    public readonly agentId: string,
    tenantId: string
  ) {
    super(tenantId);
  }
}
