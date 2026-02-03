export interface RunAnalysisCommand {
  projectId: string;
  tenantId: string;
  extractFromDocuments?: boolean;
  matchToActivities?: boolean;
  filterMonth?: number;
  filterYear?: number;
}
