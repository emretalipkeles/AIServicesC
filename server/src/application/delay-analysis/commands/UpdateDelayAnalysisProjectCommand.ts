import { BaseCommand } from '../../interfaces/ICommandBus';

export class UpdateDelayAnalysisProjectCommand extends BaseCommand {
  constructor(
    tenantId: string,
    public readonly projectId: string,
    public readonly name?: string,
    public readonly description?: string,
    public readonly contractNumber?: string,
    public readonly noticeToProceedDate?: Date,
    public readonly status?: string
  ) {
    super(tenantId);
  }
}
