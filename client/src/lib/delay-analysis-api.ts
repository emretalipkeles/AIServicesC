import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface DelayAnalysisProject {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  contractNumber: string | null;
  noticeToProceedDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  contractNumber?: string;
  noticeToProceedDate?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  contractNumber?: string;
  noticeToProceedDate?: string;
  status?: string;
}

async function fetchProjects(): Promise<DelayAnalysisProject[]> {
  const response = await fetch("/api/delay-analysis/projects");
  if (!response.ok) {
    throw new Error("Failed to fetch projects");
  }
  return response.json();
}

async function fetchProject(id: string): Promise<DelayAnalysisProject> {
  const response = await fetch(`/api/delay-analysis/projects/${id}`);
  if (!response.ok) {
    throw new Error("Failed to fetch project");
  }
  return response.json();
}

async function createProject(input: CreateProjectInput): Promise<DelayAnalysisProject> {
  const response = await fetch("/api/delay-analysis/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error("Failed to create project");
  }
  return response.json();
}

async function updateProject(id: string, input: UpdateProjectInput): Promise<DelayAnalysisProject> {
  const response = await fetch(`/api/delay-analysis/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error("Failed to update project");
  }
  return response.json();
}

async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`/api/delay-analysis/projects/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete project");
  }
}

export function useDelayAnalysisProjects() {
  return useQuery({
    queryKey: ["delay-analysis-projects"],
    queryFn: fetchProjects,
  });
}

export function useDelayAnalysisProject(id: string) {
  return useQuery({
    queryKey: ["delay-analysis-projects", id],
    queryFn: () => fetchProject(id),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delay-analysis-projects"] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProjectInput }) => updateProject(id, input),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["delay-analysis-projects"] });
      queryClient.invalidateQueries({ queryKey: ["delay-analysis-projects", id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delay-analysis-projects"] });
    },
  });
}
