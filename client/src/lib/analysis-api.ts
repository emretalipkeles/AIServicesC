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

export interface AnalysisProgressEvent {
  type: 'progress' | 'complete' | 'error';
  stage?: string;
  message: string;
  percentage?: number;
  details?: {
    current?: number;
    total?: number;
  };
  result?: AnalysisResult;
}

export function runAnalysisWithProgress(
  projectId: string,
  options: { extractFromDocuments?: boolean; matchToActivities?: boolean } = {},
  onProgress: (event: AnalysisProgressEvent) => void
): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams();
    if (options.extractFromDocuments === false) {
      params.set('extractFromDocuments', 'false');
    }
    if (options.matchToActivities === false) {
      params.set('matchToActivities', 'false');
    }

    const url = `/api/delay-analysis/projects/${projectId}/analyze/stream?${params.toString()}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as AnalysisProgressEvent;
        onProgress(data);

        if (data.type === 'complete') {
          eventSource.close();
          resolve(data.result || { eventsExtracted: 0, eventsMatched: 0, documentsProcessed: 0 });
        } else if (data.type === 'error') {
          eventSource.close();
          reject(new Error(data.message));
        }
      } catch (err) {
        console.error('Error parsing SSE message:', err, event.data);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      eventSource.close();
      reject(new Error('Connection to analysis stream failed'));
    };
  });
}
