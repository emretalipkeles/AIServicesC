import type { SetLocationOverrideCommand } from '../SetLocationOverrideCommand';
import type { IMeasuredMileRepository } from '../../../../domain/delay-analysis/repositories/IMeasuredMileRepository';

export class SetLocationOverrideCommandHandler {
  constructor(private readonly repository: IMeasuredMileRepository) {}

  async handle(command: SetLocationOverrideCommand): Promise<void> {
    await this.repository.setLocationOverride(command.projectId, command.tenantId, command.rawText, command.locationKey, command.createdBy);
  }
}
