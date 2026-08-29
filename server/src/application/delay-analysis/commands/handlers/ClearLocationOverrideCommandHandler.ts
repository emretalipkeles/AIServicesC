import type { ClearLocationOverrideCommand } from '../ClearLocationOverrideCommand';
import type { IMeasuredMileRepository } from '../../../../domain/delay-analysis/repositories/IMeasuredMileRepository';

export class ClearLocationOverrideCommandHandler {
  constructor(private readonly repository: IMeasuredMileRepository) {}

  async handle(command: ClearLocationOverrideCommand): Promise<void> {
    await this.repository.clearLocationOverride(command.projectId, command.tenantId, command.rawText);
  }
}
