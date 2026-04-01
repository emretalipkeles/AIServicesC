import { BaseCommand } from '../interfaces/ICommandBus';

export class DeleteDocumentCommand extends BaseCommand {
  readonly type = 'DeleteDocumentCommand' as const;
  constructor(
    public readonly documentId: string,
    public readonly agentId: string,
    tenantId: string
  ) {
    super(tenantId);
  }
}
