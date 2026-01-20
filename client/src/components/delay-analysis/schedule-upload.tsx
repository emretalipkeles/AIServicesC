import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, Upload, FileSpreadsheet, Trash2, AlertCircle, CheckCircle } from "lucide-react";
import { useScheduleActivities, useUploadSchedule, useDeleteAllActivities } from "@/lib/schedule-api";
import { useToast } from "@/hooks/use-toast";

interface ScheduleUploadProps {
  projectId: string;
}

export function ScheduleUpload({ projectId }: ScheduleUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [scheduleMonth, setScheduleMonth] = useState("");
  const { toast } = useToast();

  const { data: activities = [], isLoading } = useScheduleActivities(projectId);
  const uploadMutation = useUploadSchedule();
  const deleteMutation = useDeleteAllActivities();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const excelFile = files.find(f => 
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
    );

    if (excelFile) {
      handleUpload(excelFile);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel file (.xlsx or .xls)",
        variant: "destructive",
      });
    }
  }, [scheduleMonth]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    e.target.value = "";
  };

  const handleUpload = async (file: File) => {
    try {
      const result = await uploadMutation.mutateAsync({
        projectId,
        file,
        scheduleUpdateMonth: scheduleMonth || undefined,
      });

      toast({
        title: "Schedule uploaded successfully",
        description: `Imported ${result.activitiesImported} activities from ${result.totalRowsProcessed} rows`,
      });

      if (result.warnings && result.warnings.length > 0) {
        toast({
          title: "Upload completed with warnings",
          description: result.warnings.slice(0, 3).join("; "),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload schedule",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm("Are you sure you want to delete all schedule activities? This cannot be undone.")) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(projectId);
      toast({
        title: "Activities deleted",
        description: "All schedule activities have been removed",
      });
    } catch (error) {
      toast({
        title: "Delete failed",
        description: "Failed to delete activities",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload CPM Schedule</CardTitle>
          <CardDescription>
            Upload Excel files containing schedule activities to extract Activity IDs, WBS, and dates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="scheduleMonth">Schedule Update Month (optional)</Label>
              <Input
                id="scheduleMonth"
                placeholder="e.g., 2024-01 or January 2024"
                value={scheduleMonth}
                onChange={(e) => setScheduleMonth(e.target.value)}
              />
            </div>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragOver 
                ? "border-primary bg-primary/5" 
                : "border-border hover:border-primary/50"
            }`}
          >
            <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">Upload CPM Schedule</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Drag and drop Excel files (.xlsx, .xls), or click to browse
            </p>
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                disabled={uploadMutation.isPending}
                onClick={() => document.getElementById("schedule-file-input")?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploadMutation.isPending ? "Uploading..." : "Select File"}
              </Button>
              <input
                id="schedule-file-input"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Schedule Activities</CardTitle>
            <CardDescription>
              {activities.length} activities loaded from uploaded schedules
            </CardDescription>
          </div>
          {activities.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAll}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete All
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading activities...
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No schedule activities uploaded yet</p>
              <p className="text-sm mt-2">Upload a CPM schedule Excel file to get started</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity ID</TableHead>
                    <TableHead>WBS</TableHead>
                    <TableHead className="min-w-[200px]">Description</TableHead>
                    <TableHead>Planned Start</TableHead>
                    <TableHead>Planned Finish</TableHead>
                    <TableHead>Critical</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="font-mono text-sm">{activity.activityId}</TableCell>
                      <TableCell className="font-mono text-sm">{activity.wbs || "-"}</TableCell>
                      <TableCell className="max-w-[300px] truncate" title={activity.activityDescription}>
                        {activity.activityDescription}
                      </TableCell>
                      <TableCell>{formatDate(activity.plannedStartDate)}</TableCell>
                      <TableCell>{formatDate(activity.plannedFinishDate)}</TableCell>
                      <TableCell>
                        {activity.isCriticalPath === "yes" ? (
                          <Badge variant="destructive">Critical</Badge>
                        ) : activity.isCriticalPath === "no" ? (
                          <Badge variant="secondary">No</Badge>
                        ) : (
                          <Badge variant="outline">Unknown</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
