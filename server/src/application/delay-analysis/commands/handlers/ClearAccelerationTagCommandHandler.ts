import type { ClearAccelerationTagCommand } from '../ClearAccelerationTagCommand';
import type { IMeasuredMileRepository } from '../../../../domain/delay-analysis/repositories/IMeasuredMileRepository';

export class ClearAccelerationTagCommandHandler {
  constructor(private readonly repository: IMeasuredMileRepository) {}

  async handle(command: ClearAccelerationTagCommand): Promise<void> {
    await this.repository.clearAccelerationTag(command.projectId, command.tenantId, command.itemNo, command.peNumber);
  }
}
