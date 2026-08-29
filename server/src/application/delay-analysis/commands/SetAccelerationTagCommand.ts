export interface SetAccelerationTagCommand {
  type: 'SetAccelerationTagCommand';
  projectId: string;
  tenantId: string;
  itemNo: number;
  peNumber: number;
  createdBy?: string;
}
