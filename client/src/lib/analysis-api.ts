import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface DelayEventDto {
  id: string;
  sourceDocumentId: string | null;
  matchedActivityId: string | null;
  wbs: string | null;
  cpmActivityId: string | null;
  cpmActivityDescription: string | null;
  eventDescription: string;
  eventCategory: string | null;
  eventStartDate: string | null;
  eventFinishDate: string | null;
  impactDurationHours: number | null;
  sourceReference: string | null;
  extractedFromCode: string | null;
  matchConfidence: number | null;
  matchReasoning: string | null;
  verificationStatus: string;
  createdAt: string;
}

export interface AnalysisResult {
  eventsExtracted: number;
  eventsMatched: number;
  documentsProcessed: number;
  warnings?: string[];
}

async function fetchDelayEvents(projectId: string): Promise<DelayEventDto[]> {
  const response = await fetch(`/api/delay-analysis/projects/${projectId}/delay-events`);
  if (!response.ok) {
    throw new Error("Failed to fetch delay events");
  }
  const result = await response.json();
  return result.data;
}

async function runAnalysis(
  projectId: string,
  options: { extractFromDocuments?: boolean; matchToActivities?: boolean } = {}
): Promise<AnalysisResult> {
  const response = await fetch(`/api/delay-analysis/projects/${projectId}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to run analysis");
  }

  const result = await response.json();
  return result.data;
}

export function useDelayEvents(projectId: string) {
  return useQuery({
    queryKey: ["delay-events", projectId],
    queryFn: () => fetchDelayEvents(projectId),
    enabled: !!projectId,
  });
}

export function useRunAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ 
      projectId, 
      options 
    }: { 
      projectId: string; 
      options?: { extractFromDocuments?: boolean; matchToActivities?: boolean };
    }) => runAnalysis(projectId, options),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["delay-events", variables.projectId] });
    },
  });
}

export function getExportUrl(projectId: string): string {
  return `/api/delay-analysis/projects/${projectId}/export`;
}
