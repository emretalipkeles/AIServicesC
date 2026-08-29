export interface SetMeasuredMileOverrideCommand {
  type: 'SetMeasuredMileOverrideCommand';
  projectId: string;
  tenantId: string;
  itemNo: number;
  startPeNumber: number;
  endPeNumber: number;
  createdBy?: string;
}
