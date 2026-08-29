export interface ClearLocationOverrideCommand {
  type: 'ClearLocationOverrideCommand';
  projectId: string;
  tenantId: string;
  rawText: string;
}
