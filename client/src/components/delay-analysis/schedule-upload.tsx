import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, FileSpreadsheet, Trash2, FileText, Loader2, DollarSign, CheckCircle, Clock, Search } from "lucide-react";
import { useScheduleActivities, useDeleteAllActivities, uploadScheduleWithProgress } from "@/lib/schedule-api";
import { fetchRunTokenUsage } from "@/lib/analysis-api";
import { useUploadState } from "@/contexts/upload-state-context";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { GlassCard, SectionHeader, UploadZone, ProgressIndicator, StatCard, TableFilter, tableHeaderStyles, tableHeaderCellStyles } from "./ui/premium-components";
import { cn } from "@/lib/utils";

interface ScheduleUploadProps {
  projectId: string;
}

export function ScheduleUpload({ projectId }: ScheduleUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [filterText, setFilterText] = useState("");
  const uploadSectionRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    scheduleUpload,
    startScheduleUpload,
    updateScheduleProgress,
    completeScheduleUpload,
    failScheduleUpload,
  } = useUploadState(projectId);

  const isUploading = scheduleUpload.isUploading;
  const progressState = scheduleUpload.progress;
  const lastUploadCost = scheduleUpload.lastCost;

  const scrollToUpload = () => {
    uploadSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    e.target.value = "";
  };

  const handleUpload = async (file: File) => {
    startScheduleUpload();

    try {
      const result = await uploadScheduleWithProgress(
        projectId,
        file,
        (event) => {
          updateScheduleProgress(event);
        }
      );

      const parts = [];
      if (result.activitiesImported > 0) parts.push(`${result.activitiesImported} new`);
      if (result.activitiesUpdated > 0) parts.push(`${result.activitiesUpdated} updated`);
      if (result.activitiesSkipped > 0) parts.push(`${result.activitiesSkipped} unchanged`);
      const description = parts.join(", ") || "No activities with actual dates found";

      toast({
        title: "Schedule uploaded",
        description,
      });

      if (result.warnings && result.warnings.length > 0) {
        toast({
          title: "Processing completed with warnings",
          description: result.warnings.slice(0, 3).join("; "),
          variant: "destructive",
        });
      }

      let uploadCost = null;
      if (result.runId) {
        try {
          uploadCost = await fetchRunTokenUsage(result.runId);
        } catch (costError) {
          console.error('Failed to fetch token usage:', costError);
        }
      }
      
      completeScheduleUpload(uploadCost);
      queryClient.invalidateQueries({ queryKey: ["schedule-activities", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project-documents", projectId] });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to upload schedule";
      failScheduleUpload(errorMessage);
      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive",
      });
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard label="Total Activities" value={activities.length} icon={Calendar} />
        <StatCard label="With Actual Dates" value={activities.filter(a => a.actualStartDate || a.actualFinishDate).length} icon={CheckCircle} color="success" />
      </div>

      <GlassCard>
        <SectionHeader 
          icon={Clock} 
          title="Schedule Activities" 
          description={`${activities.length} activities with actual dates loaded`}
          gradient="teal"
          action={
            <div className="flex items-center gap-2">
              {activities.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAll}
                  disabled={deleteMutation.isPending}
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete All
                </Button>
              )}
              <Button onClick={scrollToUpload} size="sm" className="gap-2">
                <Calendar className="w-4 h-4" />
                Upload
              </Button>
            </div>
          }
        />
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : activities.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <Calendar className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-1">No schedule activities yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Upload a CPM schedule to extract activities with actual dates
              </p>
            </motion.div>
          ) : (
            <div className="space-y-4">
              <TableFilter
                value={filterText}
                onChange={setFilterText}
                placeholder="Filter by Activity ID or Description..."
                className="max-w-md"
              />
              <div className="rounded-xl border border-border/50 overflow-auto max-h-[500px]">
                <table className="w-full">
                  <thead className={tableHeaderStyles}>
                    <tr>
                      <th className={tableHeaderCellStyles}>Activity ID</th>
                      <th className={cn(tableHeaderCellStyles, "min-w-[200px]")}>Description</th>
                      <th className={tableHeaderCellStyles}>Actual Start</th>
                      <th className={tableHeaderCellStyles}>Actual Finish</th>
                      <th className={cn(tableHeaderCellStyles, "text-center")}>Critical Path</th>
                      <th className={cn(tableHeaderCellStyles, "text-center")}>Total Float</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {activities
                        .filter(activity => {
                          if (!filterText) return true;
                          const search = filterText.toLowerCase();
                          return (
                            activity.activityId.toLowerCase().includes(search) ||
                            (activity.wbs || "").toLowerCase().includes(search) ||
                            activity.activityDescription.toLowerCase().includes(search)
                          );
                        })
                        .map((activity, index) => (
                          <motion.tr
                            key={activity.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: index * 0.02 }}
                            className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                          >
                            <td className="p-3 font-mono text-sm">{activity.activityId}</td>
                            <td className="p-3 max-w-[300px] truncate" title={activity.activityDescription}>
                              {activity.activityDescription}
                            </td>
                            <td className="p-3 text-sm">{formatDate(activity.actualStartDate)}</td>
                            <td className="p-3 text-sm">{formatDate(activity.actualFinishDate)}</td>
                            <td className="p-3 text-sm text-center">{activity.isCriticalPath === 'yes' ? 'Yes' : activity.isCriticalPath === 'no' ? 'No' : '-'}</td>
                            <td className="p-3 text-sm text-center">{activity.totalFloat !== null && activity.totalFloat !== undefined ? activity.totalFloat : '-'}</td>
                          </motion.tr>
                        ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      <div ref={uploadSectionRef}>
        <GlassCard delay={0.1}>
          <SectionHeader 
            icon={Calendar} 
            title="Upload CPM Schedule" 
            description="Extract activities with actual dates from Excel or PDF files"
            gradient="purple"
          />
          <div className="p-6 space-y-6">
{/* AI cost display hidden for presentation
            {lastUploadCost && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800 flex items-center gap-2"
              >
                <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="text-sm text-green-700 dark:text-green-300">
                  AI cost for this upload: <span className="font-semibold">${lastUploadCost.totalCostUsd.toFixed(4)}</span>
                </span>
              </motion.div>
            )}
*/}

            <input
              type="file"
              id="schedule-file-input"
              className="hidden"
              accept=".xlsx,.xls,.pdf"
              onChange={handleFileSelect}
            />

            {isUploading && progressState ? (
              <ProgressIndicator
                stage={progressState.stage || ''}
                message={progressState.message}
                percentage={progressState.percentage || 0}
                details={progressState.details}
              />
            ) : (
              <UploadZone
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                isDragOver={isDragOver}
                isUploading={isUploading}
                onBrowse={() => document.getElementById('schedule-file-input')?.click()}
                title={isDragOver ? "Drop schedule here" : "Upload CPM Schedule"}
                description="Drag and drop your schedule file"
                icons={[FileSpreadsheet, FileText]}
                acceptedFormats="Excel (.xlsx, .xls) or PDF files"
              />
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
