export interface GetMeasuredMileLocationSeriesQuery {
  projectId: string;
  tenantId: string;
  itemNo: number;
  verifiedOnly: boolean;
  wbsCodes?: string[];
  shiftHours: number;
}
