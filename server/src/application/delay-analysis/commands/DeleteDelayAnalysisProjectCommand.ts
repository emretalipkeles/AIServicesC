import { BaseCommand } from '../../interfaces/ICommandBus';

export class DeleteDelayAnalysisProjectCommand extends BaseCommand {
  constructor(
    tenantId: string,
    public readonly projectId: string
  ) {
    super(tenantId);
  }
}
