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
  runId?: string;
}

export interface RunTokenUsageSummary {
  runId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  operationCount: number;
}

export async function fetchRunTokenUsage(runId: string): Promise<RunTokenUsageSummary | null> {
  const response = await fetch(`/api/delay-analysis/runs/${runId}/token-usage`);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error("Failed to fetch token usage");
  }
  const result = await response.json();
  return result.data;
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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface DelayEventsChatResponse {
  response: string;
  isRefusal: boolean;
}

export type StreamingChatEventType = 
  | 'progress' 
  | 'content' 
  | 'done' 
  | 'error';

export type StreamingChatStage = 
  | 'analyzing' 
  | 'searching_events' 
  | 'fetching_document' 
  | 'processing_tool' 
  | 'generating_response';

export interface StreamingChatProgressEvent {
  type: 'progress';
  stage: StreamingChatStage;
  message: string;
}

export interface StreamingChatContentEvent {
  type: 'content';
  content: string;
}

export interface StreamingChatDoneEvent {
  type: 'done';
}

export interface StreamingChatErrorEvent {
  type: 'error';
  message: string;
}

export type StreamingChatEvent = 
  | StreamingChatProgressEvent 
  | StreamingChatContentEvent 
  | StreamingChatDoneEvent 
  | StreamingChatErrorEvent;

export async function sendDelayEventsChat(
  projectId: string,
  message: string,
  conversationHistory: ChatMessage[] = []
): Promise<DelayEventsChatResponse> {
  const response = await fetch(`/api/delay-analysis/projects/${projectId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversationHistory }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to send chat message");
  }

  const result = await response.json();
  return result.data;
}

export interface StreamingChatCallbacks {
  onProgress?: (event: StreamingChatProgressEvent) => void;
  onContent?: (content: string, accumulated: string) => void;
  onDone?: (fullContent: string) => void;
  onError?: (error: Error) => void;
}

export async function streamDelayEventsChat(
  projectId: string,
  message: string,
  conversationHistory: ChatMessage[] = [],
  callbacks: StreamingChatCallbacks = {}
): Promise<string> {
  const response = await fetch(`/api/delay-analysis/projects/${projectId}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversationHistory }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Stream request failed' }));
    throw new Error(error.error || "Failed to start streaming chat");
  }

  if (!response.body) {
    throw new Error("No response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulatedContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || "";

    for (const eventStr of events) {
      const lines = eventStr.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data) as StreamingChatEvent;

            switch (event.type) {
              case 'progress':
                callbacks.onProgress?.(event);
                break;
              case 'content':
                accumulatedContent += event.content;
                callbacks.onContent?.(event.content, accumulatedContent);
                break;
              case 'done':
                callbacks.onDone?.(accumulatedContent);
                break;
              case 'error':
                const err = new Error(event.message);
                callbacks.onError?.(err);
                throw err;
            }
          } catch (parseError) {
            if (parseError instanceof SyntaxError) {
              continue;
            }
            throw parseError;
          }
        }
      }
    }
  }

  return accumulatedContent;
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
