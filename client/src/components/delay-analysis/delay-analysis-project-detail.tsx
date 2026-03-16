import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDelayAnalysisProject, useUpdateProject, type DelayAnalysisProject } from "@/lib/delay-analysis-api";
import { useProjectDocuments } from "@/lib/project-documents-api";
import { useScheduleActivities } from "@/lib/schedule-api";
import { useDelayEvents } from "@/lib/analysis-api";
import { useUploadState } from "@/contexts/upload-state-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, Save, Calendar, Upload, BarChart3, Activity, 
  AlertCircle, Loader2, CheckCircle2, FolderOpen
} from "lucide-react";
import { DocumentUpload } from "./document-upload";
import { ScheduleUpload } from "./schedule-upload";
import { DelayEvents } from "./delay-events";
import { AnalysisResults } from "./analysis-results";
import { HeroHeader, GlassCard, PremiumTabs } from "./ui/premium-components";

interface DelayAnalysisProjectDetailProps {
  projectId: string;
  onBack: () => void;
}

const tabs = [
  { value: "schedule", label: "Schedule", icon: Calendar },
  { value: "documents", label: "Documents", icon: Upload },
  { value: "delays", label: "Delay Events", icon: Activity },
  { value: "results", label: "Results", icon: BarChart3 },
];

export function DelayAnalysisProjectDetail({ projectId, onBack }: DelayAnalysisProjectDetailProps) {
  const { data: project, isLoading, error } = useDelayAnalysisProject(projectId);
  const { data: documents = [] } = useProjectDocuments(projectId);
  const { data: activities = [] } = useScheduleActivities(projectId);
  const [filterMonth, setFilterMonth] = useState<number>(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterInitialized, setFilterInitialized] = useState(false);

  const { data: allDelayEvents = [] } = useDelayEvents(projectId);

  useEffect(() => {
    if (!filterInitialized && allDelayEvents.length > 0) {
      const dates = allDelayEvents
        .map(e => e.eventStartDate)
        .filter((d): d is string => d !== null)
        .map(d => new Date(d));
      if (dates.length > 0) {
        const latest = dates.reduce((a, b) => (a > b ? a : b));
        setFilterMonth(latest.getMonth() + 1);
        setFilterYear(latest.getFullYear());
      }
      setFilterInitialized(true);
    }
  }, [allDelayEvents, filterInitialized]);
  const updateProject = useUpdateProject();
  const { toast } = useToast();
  const { scheduleUpload, documentUpload, analysis } = useUploadState(projectId);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedProject, setEditedProject] = useState<Partial<DelayAnalysisProject>>({});
  const [activeTab, setActiveTab] = useState("schedule");

  const handleSave = async () => {
    try {
      await updateProject.mutateAsync({
        id: projectId,
        input: {
          name: editedProject.name,
          description: editedProject.description || undefined,
          contractNumber: editedProject.contractNumber || undefined,
        },
      });
      toast({ title: "Success", description: "Project updated successfully" });
      setIsEditing(false);
    } catch (err) {
      toast({ title: "Error", description: "Failed to update project", variant: "destructive" });
    }
  };

  const startEditing = () => {
    if (project) {
      setEditedProject({
        name: project.name,
        description: project.description || "",
        contractNumber: project.contractNumber || "",
      });
      setIsEditing(true);
    }
  };

  const completedDocs = documents.filter(d => d.status === 'completed').length;
  const matchedEvents = allDelayEvents.filter(e => e.cpmActivityId !== null).length;

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
        <Button variant="outline" onClick={onBack}>Go Back</Button>
      </motion.div>
    );
  }

  const heroStats = [
    { label: "Documents", value: documents.length, icon: FolderOpen },
    { label: "Processed", value: completedDocs, icon: CheckCircle2 },
    { label: "Activities", value: activities.length, icon: Calendar },
    { label: "Delay Events", value: allDelayEvents.length, icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 via-background to-background">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {isEditing ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <GlassCard>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => setIsEditing(false)}>
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <h2 className="text-xl font-semibold">Edit Project Details</h2>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={updateProject.isPending} className="gap-2">
                      <Save className="w-4 h-4" />
                      {updateProject.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Project Name</Label>
                    <Input
                      id="name"
                      value={editedProject.name || ""}
                      onChange={(e) => setEditedProject({ ...editedProject, name: e.target.value })}
                      className="bg-background/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contractNumber">Contract Number</Label>
                    <Input
                      id="contractNumber"
                      value={editedProject.contractNumber || ""}
                      onChange={(e) => setEditedProject({ ...editedProject, contractNumber: e.target.value })}
                      className="bg-background/50"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={editedProject.description || ""}
                      onChange={(e) => setEditedProject({ ...editedProject, description: e.target.value })}
                      className="bg-background/50 min-h-[100px]"
                    />
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ) : (
          <>
            <HeroHeader
              title={project.name}
              subtitle={project.contractNumber || undefined}
              badge={{ 
                label: project.status.charAt(0).toUpperCase() + project.status.slice(1), 
                variant: project.status === "active" ? "active" : "inactive" 
              }}
              onBack={onBack}
              actions={
                <Button 
                  variant="outline" 
                  onClick={startEditing}
                  className="bg-background/50 hover:bg-background"
                >
                  Edit Details
                </Button>
              }
              stats={heroStats}
            />

            <div className="flex flex-col lg:flex-row gap-6">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="w-full"
              >
                <PremiumTabs 
                  tabs={tabs} 
                  value={activeTab} 
                  onChange={setActiveTab}
                  uploadIndicators={[
                    ...(scheduleUpload.isUploading && scheduleUpload.progress
                      ? [{ type: 'schedule' as const, percentage: scheduleUpload.progress.percentage || 0 }]
                      : []),
                    ...(documentUpload.isUploading
                      ? [{ type: 'document' as const, isIndeterminate: true, count: documentUpload.uploadingCount }]
                      : []),
                    ...(analysis.isAnalyzing && analysis.progress
                      ? [{ type: 'analysis' as const, percentage: analysis.progress.percentage || 0 }]
                      : []),
                  ]}
                />
              </motion.div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {activeTab === "documents" && <DocumentUpload projectId={projectId} />}
                {activeTab === "schedule" && <ScheduleUpload projectId={projectId} />}
                {activeTab === "delays" && (
                  <DelayEvents
                    projectId={projectId}
                    filterMonth={filterMonth}
                    filterYear={filterYear}
                    onFilterMonthChange={setFilterMonth}
                    onFilterYearChange={setFilterYear}
                  />
                )}
                {activeTab === "results" && (
                  <AnalysisResults
                    projectId={projectId}
                    filterMonth={filterMonth}
                    filterYear={filterYear}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

