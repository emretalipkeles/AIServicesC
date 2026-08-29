import type { UpdateCorridorLocationCommand } from '../UpdateCorridorLocationCommand';
import type { IMeasuredMileRepository } from '../../../../domain/delay-analysis/repositories/IMeasuredMileRepository';
import type { CanonicalCorridorLocation } from '../../../../domain/measured-mile/CorridorLocationModel';

export class UpdateCorridorLocationCommandHandler {
  constructor(private readonly repository: IMeasuredMileRepository) {}

  async handle(command: UpdateCorridorLocationCommand): Promise<CanonicalCorridorLocation> {
    return this.repository.updateCorridorLocation(command.projectId, command.tenantId, command.locationKey, {
      label: command.label,
      stationOrder: command.stationOrder,
    });
  }
}
