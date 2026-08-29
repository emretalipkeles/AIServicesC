import type { SetMeasuredMileOverrideCommand } from '../SetMeasuredMileOverrideCommand';
import type { IMeasuredMileRepository } from '../../../../domain/delay-analysis/repositories/IMeasuredMileRepository';

export class SetMeasuredMileOverrideCommandHandler {
  constructor(private readonly repository: IMeasuredMileRepository) {}

  async handle(command: SetMeasuredMileOverrideCommand): Promise<void> {
    if (command.startPeNumber > command.endPeNumber) {
      throw new Error('startPeNumber must be less than or equal to endPeNumber');
    }
    await this.repository.setMeasuredMileOverride(
      command.projectId,
      command.tenantId,
      command.itemNo,
      { startPeNumber: command.startPeNumber, endPeNumber: command.endPeNumber },
      command.createdBy
    );
  }
}
