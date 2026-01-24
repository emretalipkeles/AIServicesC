import { useState, useEffect } from "react";
import { DelayAnalysisProjects } from "./delay-analysis-projects";
import { DelayAnalysisProjectDetail } from "./delay-analysis-project-detail";
import { UploadStateProvider } from "@/contexts/upload-state-context";
import { useOptionalTabContext } from "@/contexts/tab-context";
import type { DelayAnalysisProject } from "@/lib/delay-analysis-api";

export function DelayAnalysis() {
  const [selectedProject, setSelectedProject] = useState<DelayAnalysisProject | null>(null);
  const tabContext = useOptionalTabContext();

  useEffect(() => {
    if (tabContext) {
      tabContext.setActiveDelayAnalysisProject(selectedProject?.id || null);
    }
  }, [selectedProject, tabContext]);

  const handleBack = () => {
    setSelectedProject(null);
  };

  if (selectedProject) {
    return (
      <UploadStateProvider>
        <DelayAnalysisProjectDetail
          projectId={selectedProject.id}
          onBack={handleBack}
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
