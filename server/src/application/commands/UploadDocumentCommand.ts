import { BaseCommand } from '../interfaces/ICommandBus';

export class UploadDocumentCommand extends BaseCommand {
  constructor(
    public readonly agentId: string,
    tenantId: string,
    public readonly filename: string,
    public readonly contentType: string,
    public readonly rawContent: string
  ) {
    super(tenantId);
  }
}
