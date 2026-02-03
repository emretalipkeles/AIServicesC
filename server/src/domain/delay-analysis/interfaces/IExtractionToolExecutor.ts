export interface ScheduleActivityLookupParams {
  tenantId: string;
  projectId: string;
  activityIds: string[];
}

export interface ScheduleActivityLookupDto {
  activityId: string;
  wbs: string | null;
  activityDescription: string;
  plannedStartDate: Date | null;
  plannedFinishDate: Date | null;
  actualStartDate: Date | null;
  actualFinishDate: Date | null;
  isCriticalPath: string;
  totalFloat: number | null;
}

export interface ScheduleActivityLookupResult {
  found: ScheduleActivityLookupDto[];
  notFound: string[];
}

export interface ExtractionToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface IExtractionToolExecutor {
  readonly toolName: string;
  getToolDefinition(): ExtractionToolDefinition;
  execute(params: ScheduleActivityLookupParams): Promise<ScheduleActivityLookupResult>;
}
