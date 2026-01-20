import { useState } from "react";
import { DelayAnalysisProjects } from "./delay-analysis-projects";
import { DelayAnalysisProjectDetail } from "./delay-analysis-project-detail";
import { UploadStateProvider } from "@/contexts/upload-state-context";
import type { DelayAnalysisProject } from "@/lib/delay-analysis-api";

export function DelayAnalysis() {
  const [selectedProject, setSelectedProject] = useState<DelayAnalysisProject | null>(null);

  if (selectedProject) {
    return (
      <UploadStateProvider>
        <DelayAnalysisProjectDetail
          projectId={selectedProject.id}
          onBack={() => setSelectedProject(null)}
        />
      </UploadStateProvider>
    );
  }

  return (
    <DelayAnalysisProjects
      onSelectProject={setSelectedProject}
    />
  );
}
