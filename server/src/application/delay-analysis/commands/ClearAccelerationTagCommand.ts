export interface ClearAccelerationTagCommand {
  type: 'ClearAccelerationTagCommand';
  projectId: string;
  tenantId: string;
  itemNo: number;
  peNumber: number;
}
