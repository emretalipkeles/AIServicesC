import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar, FileSpreadsheet, Trash2, FileText, Loader2, DollarSign, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { useScheduleActivities, useDeleteAllActivities, uploadScheduleWithProgress, type ProgressEvent } from "@/lib/schedule-api";
import { fetchRunTokenUsage, type RunTokenUsageSummary } from "@/lib/analysis-api";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { GlassCard, SectionHeader, UploadZone, ProgressIndicator, StatCard, tableHeaderStyles, tableHeaderCellStyles, selectTriggerStyles } from "./ui/premium-components";
import { cn } from "@/lib/utils";

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

  const criticalActivities = activities.filter(a => a.isCriticalPath === "yes").length;

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total Activities" value={activities.length} icon={Calendar} />
        <StatCard label="Critical Path" value={criticalActivities} icon={AlertTriangle} color="danger" />
        <StatCard label="On Track" value={activities.length - criticalActivities} icon={CheckCircle} color="success" />
      </div>

      <GlassCard>
        <SectionHeader 
          icon={Calendar} 
          title="Upload CPM Schedule" 
          description="Extract activities with actual dates from Excel or PDF files"
          gradient="purple"
        />
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Target Month</label>
              <Select
                value={targetMonth.toString()}
                onValueChange={(v) => setTargetMonth(parseInt(v))}
                disabled={isUploading}
              >
                <SelectTrigger className={selectTriggerStyles}>
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
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Target Year</label>
              <Select
                value={targetYear.toString()}
                onValueChange={(v) => setTargetYear(parseInt(v))}
                disabled={isUploading}
              >
                <SelectTrigger className={selectTriggerStyles}>
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

      <GlassCard delay={0.1}>
        <SectionHeader 
          icon={Clock} 
          title="Schedule Activities" 
          description={`${activities.length} activities with actual dates loaded`}
          gradient="teal"
          action={
            activities.length > 0 && (
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
            )
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
            <div className="rounded-xl border border-border/50 overflow-auto max-h-[500px]">
              <table className="w-full">
                <thead className={tableHeaderStyles}>
                  <tr>
                    <th className={tableHeaderCellStyles}>Activity ID</th>
                    <th className={tableHeaderCellStyles}>WBS</th>
                    <th className={cn(tableHeaderCellStyles, "min-w-[200px]")}>Description</th>
                    <th className={tableHeaderCellStyles}>Actual Start</th>
                    <th className={tableHeaderCellStyles}>Actual Finish</th>
                    <th className={tableHeaderCellStyles}>Critical</th>
                  </tr>
                </thead>
                  <tbody>
                    <AnimatePresence>
                      {activities.map((activity, index) => (
                        <motion.tr
                          key={activity.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: index * 0.02 }}
                          className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                        >
                          <td className="p-3 font-mono text-sm">{activity.activityId}</td>
                          <td className="p-3 font-mono text-sm text-muted-foreground">{activity.wbs || "-"}</td>
                          <td className="p-3 max-w-[300px] truncate" title={activity.activityDescription}>
                            {activity.activityDescription}
                          </td>
                          <td className="p-3 text-sm">{formatDate(activity.actualStartDate)}</td>
                          <td className="p-3 text-sm">{formatDate(activity.actualFinishDate)}</td>
                          <td className="p-3">
                            {activity.isCriticalPath === "yes" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-red-500/20">
                                Critical
                              </span>
                            ) : activity.isCriticalPath === "no" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-600 dark:text-zinc-400">
                                No
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                Unknown
                              </span>
                            )}
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
