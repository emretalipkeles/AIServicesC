import { BaseCommand } from '../../interfaces/ICommandBus';

export class DeleteDelayAnalysisProjectCommand extends BaseCommand {
  readonly type = 'DeleteDelayAnalysisProjectCommand' as const;
  constructor(
    tenantId: string,
    public readonly projectId: string
  ) {
    super(tenantId);
  }
}
