import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ScheduleActivityDto {
  id: string;
  activityId: string;
  wbs: string | null;
  activityDescription: string;
  plannedStartDate: string | null;
  plannedFinishDate: string | null;
  actualStartDate: string | null;
  actualFinishDate: string | null;
  scheduleUpdateMonth: string | null;
  isCriticalPath: string;
  totalFloat: number | null;
  sourceDocumentId: string | null;
  createdAt: string;
}

export interface UploadScheduleResult {
  documentId: string;
  activitiesImported: number;
  activitiesUpdated: number;
  activitiesSkipped: number;
  totalRowsProcessed: number;
  scheduleUpdateMonth: string | null;
  warnings?: string[];
  runId?: string;
}

export interface ProgressEvent {
  type: 'progress' | 'complete' | 'error';
  stage?: string;
  message: string;
  percentage?: number;
  details?: {
    current?: number;
    total?: number;
    batchNumber?: number;
    totalBatches?: number;
  };
  result?: UploadScheduleResult;
  error?: string;
}

async function fetchScheduleActivities(projectId: string): Promise<ScheduleActivityDto[]> {
  const response = await fetch(`/api/delay-analysis/projects/${projectId}/schedule/activities`);
  if (!response.ok) {
    throw new Error("Failed to fetch schedule activities");
  }
  const result = await response.json();
  return result.data;
}

export function uploadScheduleWithProgress(
  projectId: string,
  file: File,
  onProgress: (event: ProgressEvent) => void
): Promise<UploadScheduleResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    fetch(`/api/delay-analysis/projects/${projectId}/schedule/stream`, {
      method: "POST",
      body: formData,
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((err) => {
            throw new Error(err.error || "Failed to upload schedule");
          });
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        const processStream = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6)) as ProgressEvent;
                  onProgress(data);

                  if (data.type === "complete" && data.result) {
                    resolve(data.result);
                    return;
                  }

                  if (data.type === "error") {
                    reject(new Error(data.message || "Upload failed"));
                    return;
                  }
                } catch (e) {
                  console.error("Failed to parse SSE data:", e);
                }
              }
            }
          }
        };

        processStream().catch(reject);
      })
      .catch(reject);
  });
}

async function deleteAllActivities(projectId: string): Promise<void> {
  const response = await fetch(`/api/delay-analysis/projects/${projectId}/schedule/activities`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete activities");
  }
}

export function useScheduleActivities(projectId: string) {
  return useQuery({
    queryKey: ["schedule-activities", projectId],
    queryFn: () => fetchScheduleActivities(projectId),
    enabled: !!projectId,
  });
}

export function useDeleteAllActivities() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) => deleteAllActivities(projectId),
    onSuccess: (_data, projectId) => {
      queryClient.invalidateQueries({ queryKey: ["schedule-activities", projectId] });
    },
  });
}
