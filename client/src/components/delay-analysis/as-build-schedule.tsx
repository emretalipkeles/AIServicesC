import { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, FileCheck2, Loader2 } from "lucide-react";
import { useDelayAnalysisProject } from "@/lib/delay-analysis-api";
import { HeroHeader, PremiumTabs } from "./ui/premium-components";
import { XerRoundTrip } from "./xer-round-trip";

// Sub-sections of the As Build Schedule workspace. XER Null Test is the first
// one; more will be added here as the as-built schedule toolset grows.
const sections = [
  { value: "xer", label: "XER Null Test", icon: FileCheck2 },
];

export function AsBuildSchedule({ projectId }: { projectId: string }) {
  const { data: project, isLoading, error } = useDelayAnalysisProject(projectId);
  const [activeSection, setActiveSection] = useState("xer");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="w-8 h-8 text-primary" />
        </motion.div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center h-64 gap-4"
      >
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <div className="text-destructive font-medium">Failed to load project</div>
      </motion.div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 via-background to-background">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <HeroHeader
          title="As Build Schedule"
          subtitle={project.name}
          badge={{
            label: project.status.charAt(0).toUpperCase() + project.status.slice(1),
            variant: project.status === "active" ? "active" : "inactive",
          }}
        />

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          className="w-full"
        >
          <PremiumTabs tabs={sections} value={activeSection} onChange={setActiveSection} />
        </motion.div>

        <motion.div
          key={activeSection}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeSection === "xer" && <XerRoundTrip projectId={projectId} />}
        </motion.div>
      </div>
    </div>
  );
}
