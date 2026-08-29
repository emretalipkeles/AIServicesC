export interface GetMeasuredMilePeriodDetailQuery {
  projectId: string;
  tenantId: string;
  peNumber: number;
  verifiedOnly: boolean;
  wbsCodes?: string[];
}
