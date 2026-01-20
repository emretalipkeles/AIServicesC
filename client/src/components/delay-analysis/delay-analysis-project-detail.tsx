import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDelayAnalysisProject, useUpdateProject, type DelayAnalysisProject } from "@/lib/delay-analysis-api";
import { useProjectDocuments } from "@/lib/project-documents-api";
import { useScheduleActivities } from "@/lib/schedule-api";
import { useDelayEvents } from "@/lib/analysis-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, Save, FileText, Calendar, Upload, BarChart3, Activity, 
  AlertCircle, Loader2, Clock, CheckCircle2, FolderOpen
} from "lucide-react";
import { format } from "date-fns";
import { DocumentUpload } from "./document-upload";
import { ScheduleUpload } from "./schedule-upload";
import { DelayEvents } from "./delay-events";
import { AnalysisResults } from "./analysis-results";
import { HeroHeader, GlassCard, PremiumTabs } from "./ui/premium-components";
import { cn } from "@/lib/utils";

interface DelayAnalysisProjectDetailProps {
  projectId: string;
  onBack: () => void;
}

const tabs = [
  { value: "documents", label: "Documents", icon: Upload },
  { value: "schedule", label: "Schedule", icon: Calendar },
  { value: "delays", label: "Delay Events", icon: Activity },
  { value: "results", label: "Results", icon: BarChart3 },
];

export function DelayAnalysisProjectDetail({ projectId, onBack }: DelayAnalysisProjectDetailProps) {
  const { data: project, isLoading, error } = useDelayAnalysisProject(projectId);
  const { data: documents = [] } = useProjectDocuments(projectId);
  const { data: activities = [] } = useScheduleActivities(projectId);
  const { data: delayEvents = [] } = useDelayEvents(projectId);
  const updateProject = useUpdateProject();
  const { toast } = useToast();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedProject, setEditedProject] = useState<Partial<DelayAnalysisProject>>({});
  const [activeTab, setActiveTab] = useState("documents");

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
  const matchedEvents = delayEvents.filter(e => e.cpmActivityId !== null).length;

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
    { label: "Delay Events", value: delayEvents.length, icon: Activity },
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
                <PremiumTabs tabs={tabs} value={activeTab} onChange={setActiveTab} />
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
                {activeTab === "delays" && <DelayEvents projectId={projectId} />}
                {activeTab === "results" && <AnalysisResults projectId={projectId} />}
              </motion.div>
            </AnimatePresence>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <GlassCard>
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold">Project Information</h3>
                  </div>
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    <InfoItem 
                      icon={Clock} 
                      label="Created" 
                      value={format(new Date(project.createdAt), "MMM d, yyyy")} 
                    />
                    <InfoItem 
                      icon={Clock} 
                      label="Last Updated" 
                      value={format(new Date(project.updatedAt), "MMM d, yyyy")} 
                    />
                    <InfoItem 
                      icon={Calendar} 
                      label="Notice to Proceed" 
                      value={project.noticeToProceedDate 
                        ? format(new Date(project.noticeToProceedDate), "MMM d, yyyy")
                        : "Not set"} 
                    />
                    <InfoItem 
                      icon={Activity} 
                      label="Status" 
                      value={project.status.charAt(0).toUpperCase() + project.status.slice(1)} 
                      highlight={project.status === "active"}
                    />
                  </div>
                  {project.description && (
                    <div className="mt-6 pt-6 border-t border-border/50">
                      <p className="text-sm font-medium text-muted-foreground mb-2">Description</p>
                      <p className="text-foreground">{project.description}</p>
                    </div>
                  )}
                </div>
              </GlassCard>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

interface InfoItemProps {
  icon: typeof Clock;
  label: string;
  value: string;
  highlight?: boolean;
}

function InfoItem({ icon: Icon, label, value, highlight }: InfoItemProps) {
  return (
    <div className="flex items-start gap-3">
      <div className={cn(
        "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
        highlight ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-muted/50 text-muted-foreground"
      )}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className={cn(
          "font-medium",
          highlight && "text-green-600 dark:text-green-400"
        )}>{value}</p>
      </div>
    </div>
  );
}
