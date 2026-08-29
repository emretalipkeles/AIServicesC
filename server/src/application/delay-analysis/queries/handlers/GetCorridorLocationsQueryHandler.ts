import type { GetCorridorLocationsQuery } from '../GetCorridorLocationsQuery';
import type { IMeasuredMileRepository, CorridorLocationOverrideSummary } from '../../../../domain/delay-analysis/repositories/IMeasuredMileRepository';
import type { CanonicalCorridorLocation } from '../../../../domain/measured-mile/CorridorLocationModel';

export interface GetCorridorLocationsResult {
  locations: Array<CanonicalCorridorLocation & { approxDistanceFt: number }>;
  overrides: CorridorLocationOverrideSummary[];
}

export class GetCorridorLocationsQueryHandler {
  constructor(private readonly repository: IMeasuredMileRepository) {}

  async execute(query: GetCorridorLocationsQuery): Promise<GetCorridorLocationsResult> {
    const [locations, overrides] = await Promise.all([
      this.repository.getCorridorLocations(query.projectId, query.tenantId),
      this.repository.getLocationOverrides(query.projectId, query.tenantId),
    ]);

    const ordered = [...locations].sort((a, b) => a.defaultStationOrder - b.defaultStationOrder);
    return {
      locations: ordered.map((l) => ({ ...l, approxDistanceFt: l.defaultStationOrder * 500 })),
      overrides,
    };
  }
}
