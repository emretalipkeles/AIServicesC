import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Calendar, Upload, FileSpreadsheet, Trash2, FileText, Loader2, DollarSign } from "lucide-react";
import { useScheduleActivities, useDeleteAllActivities, uploadScheduleWithProgress, type ProgressEvent, type UploadScheduleResult } from "@/lib/schedule-api";
import { fetchRunTokenUsage, type RunTokenUsageSummary } from "@/lib/analysis-api";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

interface ScheduleUploadProps {
  projectId: string;
}

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

export function ScheduleUpload({ projectId }: ScheduleUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [targetMonth, setTargetMonth] = useState<number>(new Date().getMonth() + 1);
  const [targetYear, setTargetYear] = useState<number>(currentYear);
  const [isUploading, setIsUploading] = useState(false);
  const [progressState, setProgressState] = useState<ProgressEvent | null>(null);
  const [lastUploadCost, setLastUploadCost] = useState<RunTokenUsageSummary | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: activities = [], isLoading } = useScheduleActivities(projectId);
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
    const validFile = files.find(f => 
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.pdf')
    );

    if (validFile) {
      handleUpload(validFile);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel (.xlsx, .xls) or PDF file",
        variant: "destructive",
      });
    }
  }, [targetMonth, targetYear]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    e.target.value = "";
  };

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setLastUploadCost(null);
    setProgressState({
      type: 'progress',
      stage: 'uploading',
      message: 'Starting upload...',
      percentage: 0,
    });

    try {
      const result = await uploadScheduleWithProgress(
        projectId,
        file,
        targetMonth,
        targetYear,
        (event) => {
          setProgressState(event);
        }
      );

      const monthName = MONTHS.find(m => m.value === targetMonth)?.label || "";
      
      let description = `For ${monthName} ${targetYear}: `;
      const parts = [];
      if (result.activitiesImported > 0) parts.push(`${result.activitiesImported} new`);
      if (result.activitiesUpdated > 0) parts.push(`${result.activitiesUpdated} updated`);
      if (result.activitiesSkipped > 0) parts.push(`${result.activitiesSkipped} unchanged`);
      description += parts.join(", ") || "No activities with actual dates found";

      toast({
        title: "Schedule processed",
        description,
      });

      if (result.warnings && result.warnings.length > 0) {
        toast({
          title: "Processing completed with warnings",
          description: result.warnings.slice(0, 3).join("; "),
          variant: "destructive",
        });
      }

      if (result.runId) {
        try {
          const usage = await fetchRunTokenUsage(result.runId);
          if (usage) {
            setLastUploadCost(usage);
          }
        } catch (costError) {
          console.error('Failed to fetch token usage:', costError);
        }
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload schedule",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setProgressState(null);
      queryClient.invalidateQueries({ queryKey: ["schedule-activities", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-documents", projectId] });
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
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return format(date, "d-MMM-yy");
    } catch {
      return "-";
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload CPM Schedule</CardTitle>
          <CardDescription>
            Upload Excel or PDF files. Only activities with actual dates (marked with "A") in the selected month will be extracted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Target Month</Label>
              <Select
                value={targetMonth.toString()}
                onValueChange={(v) => setTargetMonth(parseInt(v))}
                disabled={isUploading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month) => (
                    <SelectItem key={month.value} value={month.value.toString()}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target Year</Label>
              <Select
                value={targetYear.toString()}
                onValueChange={(v) => setTargetYear(parseInt(v))}
                disabled={isUploading}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {lastUploadCost && (
            <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-300">
                AI cost for this upload: <span className="font-semibold">${lastUploadCost.totalCostUsd.toFixed(4)}</span>
              </span>
            </div>
          )}

          {isUploading && progressState ? (
            <div className="border rounded-lg p-6 space-y-4 bg-muted/30">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="font-medium">{progressState.message}</span>
              </div>
              <Progress value={progressState.percentage || 0} className="h-2" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{progressState.stage?.replace(/_/g, ' ')}</span>
                <span>{progressState.percentage}%</span>
              </div>
              {progressState.details && (
                <div className="text-sm text-muted-foreground">
                  {progressState.details.batchNumber && progressState.details.totalBatches && (
                    <span>Batch {progressState.details.batchNumber} of {progressState.details.totalBatches}</span>
                  )}
                  {progressState.details.current !== undefined && progressState.details.total !== undefined && !progressState.details.batchNumber && (
                    <span>Processed {progressState.details.current} of {progressState.details.total}</span>
                  )}
                </div>
              )}
            </div>
          ) : (
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
              <div className="flex justify-center gap-2 mb-4">
                <FileSpreadsheet className="w-10 h-10 text-muted-foreground" />
                <FileText className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="font-medium mb-2">Upload CPM Schedule</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Drag and drop Excel (.xlsx, .xls) or PDF files
              </p>
              <div className="flex justify-center gap-2">
                <Button
                  variant="outline"
                  disabled={isUploading}
                  onClick={() => document.getElementById("schedule-file-input")?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Select File
                </Button>
                <input
                  id="schedule-file-input"
                  type="file"
                  accept=".xlsx,.xls,.pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Schedule Activities</CardTitle>
            <CardDescription>
              {activities.length} activities with actual dates loaded
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
              <p className="text-sm mt-2">Upload a CPM schedule to extract activities with actual dates</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity ID</TableHead>
                    <TableHead>WBS</TableHead>
                    <TableHead className="min-w-[200px]">Description</TableHead>
                    <TableHead>Actual Start</TableHead>
                    <TableHead>Actual Finish</TableHead>
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
                      <TableCell>{formatDate(activity.actualStartDate)}</TableCell>
                      <TableCell>{formatDate(activity.actualFinishDate)}</TableCell>
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
