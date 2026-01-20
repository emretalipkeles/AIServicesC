import { useState } from "react";
import { useDelayAnalysisProject, useUpdateProject, type DelayAnalysisProject } from "@/lib/delay-analysis-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, FileText, Calendar, Upload, Table, Activity, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { DocumentUpload } from "./document-upload";

interface DelayAnalysisProjectDetailProps {
  projectId: string;
  onBack: () => void;
}

export function DelayAnalysisProjectDetail({ projectId, onBack }: DelayAnalysisProjectDetailProps) {
  const { data: project, isLoading, error } = useDelayAnalysisProject(projectId);
  const updateProject = useUpdateProject();
  const { toast } = useToast();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedProject, setEditedProject] = useState<Partial<DelayAnalysisProject>>({});

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading project...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <div className="text-destructive">Failed to load project</div>
        <Button variant="outline" onClick={onBack}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
            <Badge variant={project.status === "active" ? "default" : "secondary"}>
              {project.status}
            </Badge>
          </div>
          {project.contractNumber && (
            <p className="text-muted-foreground flex items-center gap-1 mt-1">
              <FileText className="w-4 h-4" />
              {project.contractNumber}
            </p>
          )}
        </div>
        {!isEditing ? (
          <Button variant="outline" onClick={startEditing}>
            Edit Details
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateProject.isPending} className="gap-2">
              <Save className="w-4 h-4" />
              {updateProject.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={editedProject.name || ""}
                onChange={(e) => setEditedProject({ ...editedProject, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contractNumber">Contract Number</Label>
              <Input
                id="contractNumber"
                value={editedProject.contractNumber || ""}
                onChange={(e) => setEditedProject({ ...editedProject, contractNumber: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editedProject.description || ""}
                onChange={(e) => setEditedProject({ ...editedProject, description: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="documents" className="space-y-4">
          <TabsList>
            <TabsTrigger value="documents" className="gap-2">
              <Upload className="w-4 h-4" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-2">
              <Calendar className="w-4 h-4" />
              Schedule Activities
            </TabsTrigger>
            <TabsTrigger value="delays" className="gap-2">
              <Activity className="w-4 h-4" />
              Delay Events
            </TabsTrigger>
            <TabsTrigger value="results" className="gap-2">
              <Table className="w-4 h-4" />
              Analysis Results
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents">
            <DocumentUpload projectId={projectId} />
          </TabsContent>

          <TabsContent value="schedule">
            <Card>
              <CardHeader>
                <CardTitle>Schedule Activities</CardTitle>
                <CardDescription>
                  CPM schedule activities extracted from monthly schedule updates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
                  <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">Upload CPM Schedule</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Upload Excel or PDF schedule files to extract activities
                  </p>
                  <Button variant="outline" disabled>
                    Coming Soon
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="delays">
            <Card>
              <CardHeader>
                <CardTitle>Contractor Delay Events</CardTitle>
                <CardDescription>
                  CODE_CIE entries extracted from Inspector Daily Reports
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12">
                  <Activity className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">No delay events yet</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    Upload IDRs with CODE_CIE tags to extract delay events
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="results">
            <Card>
              <CardHeader>
                <CardTitle>Analysis Results</CardTitle>
                <CardDescription>
                  Delay events matched to CPM schedule activities with confidence scores
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12">
                  <Table className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">No results yet</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    Run AI analysis after uploading documents and schedule
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Project Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p>{format(new Date(project.createdAt), "MMMM d, yyyy 'at' h:mm a")}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
              <p>{format(new Date(project.updatedAt), "MMMM d, yyyy 'at' h:mm a")}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Notice to Proceed</p>
              <p>{project.noticeToProceedDate 
                ? format(new Date(project.noticeToProceedDate), "MMMM d, yyyy")
                : "Not set"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <p className="capitalize">{project.status}</p>
            </div>
          </div>
          {project.description && (
            <div className="mt-4">
              <p className="text-sm font-medium text-muted-foreground">Description</p>
              <p className="mt-1">{project.description}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
