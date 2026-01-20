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
  sourceDocumentId: string | null;
  createdAt: string;
}

export interface UploadScheduleResult {
  documentId: string;
  activitiesImported: number;
  totalRowsProcessed: number;
  scheduleUpdateMonth: string | null;
  warnings?: string[];
}

async function fetchScheduleActivities(projectId: string): Promise<ScheduleActivityDto[]> {
  const response = await fetch(`/api/delay-analysis/projects/${projectId}/schedule/activities`);
  if (!response.ok) {
    throw new Error("Failed to fetch schedule activities");
  }
  const result = await response.json();
  return result.data;
}

async function uploadSchedule(projectId: string, file: File, scheduleUpdateMonth?: string): Promise<UploadScheduleResult> {
  const formData = new FormData();
  formData.append("file", file);
  if (scheduleUpdateMonth) {
    formData.append("scheduleUpdateMonth", scheduleUpdateMonth);
  }

  const response = await fetch(`/api/delay-analysis/projects/${projectId}/schedule`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to upload schedule");
  }

  const result = await response.json();
  return result.data;
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

export function useUploadSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, file, scheduleUpdateMonth }: { 
      projectId: string; 
      file: File; 
      scheduleUpdateMonth?: string;
    }) => uploadSchedule(projectId, file, scheduleUpdateMonth),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["schedule-activities", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-documents", variables.projectId] });
    },
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
