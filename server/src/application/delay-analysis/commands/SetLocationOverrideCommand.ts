export interface SetLocationOverrideCommand {
  type: 'SetLocationOverrideCommand';
  projectId: string;
  tenantId: string;
  rawText: string;
  locationKey: string;
  createdBy?: string;
}
