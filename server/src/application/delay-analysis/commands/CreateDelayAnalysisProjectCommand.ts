import { BaseCommand } from '../../interfaces/ICommandBus';

export class CreateDelayAnalysisProjectCommand extends BaseCommand {
  constructor(
    tenantId: string,
    public readonly name: string,
    public readonly description?: string,
    public readonly contractNumber?: string,
    public readonly noticeToProceedDate?: Date
  ) {
    super(tenantId);
  }
}
