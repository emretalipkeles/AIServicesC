import { BaseCommand } from '../../interfaces/ICommandBus';

export class DeleteAllProjectDocumentsCommand extends BaseCommand {
  constructor(
    tenantId: string,
    public readonly projectId: string
  ) {
    super(tenantId);
  }
}
