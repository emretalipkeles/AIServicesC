import type { IUploadNarrator, NarratorResponse } from '../../../domain/orchestration/interfaces/IUploadNarrator';
import { NarrateUploadResultCommand } from '../commands/NarrateUploadResultCommand';

export class NarrateUploadResultHandler {
  constructor(private readonly narrator: IUploadNarrator) {}

  async handle(command: NarrateUploadResultCommand): Promise<NarratorResponse> {
    return this.narrator.narrate({
      success: command.success,
      packageName: command.packageName,
      packageId: command.packageId,
      error: command.error,
      validationErrors: command.validationErrors,
    });
  }
}
