export interface UpdateCorridorLocationCommand {
  type: 'UpdateCorridorLocationCommand';
  projectId: string;
  tenantId: string;
  locationKey: string;
  label?: string;
  stationOrder?: number;
}
