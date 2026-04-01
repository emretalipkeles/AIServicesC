import { BaseCommand } from '../../interfaces/ICommandBus';

export class DeleteAllProjectDocumentsCommand extends BaseCommand {
  readonly type = 'DeleteAllProjectDocumentsCommand' as const;
  constructor(
    tenantId: string,
    public readonly projectId: string
  ) {
    super(tenantId);
  }
}
