export interface GetMeasuredMileSeriesQuery {
  projectId: string;
  tenantId: string;
  itemNo: number;
  verifiedOnly: boolean;
  wbsCodes?: string[];
  shiftHours: number;
}
