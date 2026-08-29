import type { SetAccelerationTagCommand } from '../SetAccelerationTagCommand';
import type { IMeasuredMileRepository } from '../../../../domain/delay-analysis/repositories/IMeasuredMileRepository';

export class SetAccelerationTagCommandHandler {
  constructor(private readonly repository: IMeasuredMileRepository) {}

  async handle(command: SetAccelerationTagCommand): Promise<void> {
    await this.repository.setAccelerationTag(
      command.projectId,
      command.tenantId,
      command.itemNo,
      command.peNumber,
      command.createdBy
    );
  }
}
