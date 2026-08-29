import type { ClearMeasuredMileOverrideCommand } from '../ClearMeasuredMileOverrideCommand';
import type { IMeasuredMileRepository } from '../../../../domain/delay-analysis/repositories/IMeasuredMileRepository';

export class ClearMeasuredMileOverrideCommandHandler {
  constructor(private readonly repository: IMeasuredMileRepository) {}

  async handle(command: ClearMeasuredMileOverrideCommand): Promise<void> {
    await this.repository.clearMeasuredMileOverride(command.projectId, command.tenantId, command.itemNo);
  }
}
