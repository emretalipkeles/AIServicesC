import { useDelayAnalysisProjects, useDeleteProject, type DelayAnalysisProject } from "@/lib/delay-analysis-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FolderOpen, Trash2, Calendar, FileText, Clock } from "lucide-react";
import { format } from "date-fns";

interface DelayAnalysisProjectsProps {
  onSelectProject: (project: DelayAnalysisProject) => void;
}

export function DelayAnalysisProjects({ onSelectProject }: DelayAnalysisProjectsProps) {
  const { data: projects, isLoading, error } = useDelayAnalysisProjects();
  const deleteProject = useDeleteProject();
  const { toast } = useToast();

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this project?")) return;

    try {
      await deleteProject.mutateAsync(projectId);
      toast({ title: "Success", description: "Project deleted successfully" });
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete project", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading projects...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">Failed to load projects</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Delay Interpretation Projects</h1>
          <p className="text-muted-foreground mt-1">
            Interpret contractor-caused delays from construction documentation
          </p>
        </div>
      </div>

      {projects && projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No projects yet</h3>
            <p className="text-muted-foreground text-center">
              No delay analysis projects have been created yet
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects?.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover:border-primary/50 transition-colors group"
              onClick={() => onSelectProject(project)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{project.name}</CardTitle>
                    {project.contractNumber && (
                      <CardDescription className="mt-1 flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {project.contractNumber}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={project.status === "active" ? "default" : "secondary"}>
                      {project.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleDeleteProject(e, project.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {project.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {project.description}
                  </p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {project.noticeToProceedDate
                      ? format(new Date(project.noticeToProceedDate), "MMM d, yyyy")
                      : "NTP not set"}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {format(new Date(project.createdAt), "MMM d, yyyy")}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
