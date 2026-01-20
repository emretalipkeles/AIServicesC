export interface DelayAnalysisProjectDto {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  contractNumber: string | null;
  noticeToProceedDate: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectDocumentDto {
  id: string;
  projectId: string;
  tenantId: string;
  filename: string;
  contentType: string;
  documentType: string;
  reportDate: Date | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleActivityDto {
  id: string;
  projectId: string;
  activityId: string;
  wbs: string | null;
  activityDescription: string;
  plannedStartDate: Date | null;
  plannedFinishDate: Date | null;
  actualStartDate: Date | null;
  actualFinishDate: Date | null;
  scheduleUpdateMonth: string | null;
  isCriticalPath: string;
  createdAt: Date;
}

export interface ContractorDelayEventDto {
  id: string;
  projectId: string;
  sourceDocumentId: string | null;
  matchedActivityId: string | null;
  wbs: string | null;
  cpmActivityId: string | null;
  cpmActivityDescription: string | null;
  eventDescription: string;
  eventCategory: string | null;
  eventStartDate: Date | null;
  eventFinishDate: Date | null;
  impactDurationHours: number | null;
  sourceReference: string | null;
  extractedFromCode: string | null;
  matchConfidence: number | null;
  matchReasoning: string | null;
  verificationStatus: string;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
