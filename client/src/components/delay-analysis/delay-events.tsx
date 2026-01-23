import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Play, Download, Loader2, DollarSign, CheckCircle, AlertCircle, Clock, Zap } from "lucide-react";
import { useDelayEvents, runAnalysisWithProgress, fetchRunTokenUsage } from "@/lib/analysis-api";
import { useUploadState } from "@/contexts/upload-state-context";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { GlassCard, SectionHeader, ProgressIndicator, StatCard, TableFilter } from "./ui/premium-components";
import { cn } from "@/lib/utils";
import { exportDelayEventsToExcel } from "@/lib/excel-export";

interface DelayEventsProps {
  projectId: string;
}

export function DelayEvents({ projectId }: DelayEventsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: events = [], isLoading } = useDelayEvents(projectId);
  const [filterText, setFilterText] = useState("");
  
  const {
    analysis,
    startAnalysis,
    updateAnalysisProgress,
    completeAnalysis,
    failAnalysis,
  } = useUploadState(projectId);

  const matchedEvents = events.filter(e => e.cpmActivityId !== null);
  const highConfidence = matchedEvents.filter(e => (e.matchConfidence ?? 0) >= 80);
  const pendingEvents = events.filter(e => e.verificationStatus === 'pending');

  const handleRunAnalysis = async () => {
    startAnalysis();

    try {
      const result = await runAnalysisWithProgress(
        projectId,
        { extractFromDocuments: true, matchToActivities: true },
        (event) => {
          updateAnalysisProgress(event);
        }
      );

      toast({
        title: "Analysis complete",
        description: `Extracted ${result.eventsExtracted} events, matched ${result.eventsMatched} to activities`,
      });

      if (result.warnings && result.warnings.length > 0) {
        toast({
          title: "Analysis completed with warnings",
          description: result.warnings.slice(0, 2).join("; "),
          variant: "destructive",
        });
      }

      let cost = null;
      if (result.runId) {
        try {
          cost = await fetchRunTokenUsage(result.runId);
        } catch (costError) {
          console.error('Failed to fetch token usage:', costError);
        }
      }
      
      completeAnalysis(cost);
      queryClient.invalidateQueries({ queryKey: ["delay-events", projectId] });
    } catch (error) {
      failAnalysis(error instanceof Error ? error.message : "Failed to run analysis");
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Failed to run analysis",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["delay-events", projectId] });
    }
  };

  const handleExport = async () => {
    await exportDelayEventsToExcel(events);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  };

  const getCategoryLabel = (category: string | null) => {
    if (!category) return "Unknown";
    return category.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total Events" value={events.length} icon={Activity} />
        <StatCard label="Matched" value={matchedEvents.length} icon={CheckCircle} color="success" />
        <StatCard label="High Confidence" value={highConfidence.length} icon={Zap} color="success" />
        <StatCard label="Pending Review" value={pendingEvents.length} icon={Clock} color="warning" />
      </div>

      <GlassCard>
        <SectionHeader 
          icon={Activity} 
          title="Contractor Delay Events" 
          description="CODE_CIE entries extracted from IDRs and matched to schedule activities"
          gradient="amber"
          action={
            <div className="flex gap-2">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={handleRunAnalysis}
                  disabled={analysis.isAnalyzing}
                  className="gap-2 bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/25"
                >
                  {analysis.isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Run AI Analysis
                    </>
                  )}
                </Button>
              </motion.div>
              {events.length > 0 && (
                <Button variant="outline" onClick={handleExport} disabled={analysis.isAnalyzing} className="gap-2">
                  <Download className="w-4 h-4" />
                  Export to Excel
                </Button>
              )}
            </div>
          }
        />
        <div className="p-6">
          {analysis.progress && (
            <div className="mb-6">
              <ProgressIndicator
                stage={analysis.progress.stage || ''}
                message={analysis.progress.message}
                percentage={analysis.progress.percentage || 0}
                details={analysis.progress.details}
              />
            </div>
          )}

          {analysis.lastCost && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-3 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800 flex items-center gap-2"
            >
              <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-300">
                AI cost for this run: <span className="font-semibold">${analysis.lastCost.totalCostUsd.toFixed(4)}</span>
              </span>
            </motion.div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : events.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <Activity className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-1">No delay events yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                Upload IDRs with CODE_CIE tags and run AI analysis to extract delay events
              </p>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button onClick={handleRunAnalysis} disabled={analysis.isAnalyzing} className="gap-2">
                  <Play className="w-4 h-4" />
                  Run AI Analysis
                </Button>
              </motion.div>
            </motion.div>
          ) : (
            <div className="space-y-4">
              <TableFilter
                value={filterText}
                onChange={setFilterText}
                placeholder="Filter by description, category, or activity..."
                className="max-w-md"
              />
              <div className="space-y-3 max-h-[500px] overflow-auto">
                <AnimatePresence>
                  {events
                    .filter(event => {
                      if (!filterText) return true;
                      const search = filterText.toLowerCase();
                      return (
                        event.eventDescription.toLowerCase().includes(search) ||
                        (event.eventCategory || "").toLowerCase().includes(search) ||
                        (event.cpmActivityId || "").toLowerCase().includes(search) ||
                        (event.cpmActivityDescription || "").toLowerCase().includes(search)
                      );
                    })
                    .map((event, index) => (
                      <EventCard key={event.id} event={event} index={index} />
                    ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

interface EventCardProps {
  event: {
    id: string;
    eventDescription: string;
    eventCategory: string | null;
    eventStartDate: string | null;
    cpmActivityId: string | null;
    cpmActivityDescription: string | null;
    matchConfidence: number | null;
    matchReasoning: string | null;
    impactDurationHours: number | null;
    verificationStatus: string;
  };
  index: number;
}

function EventCard({ event, index }: EventCardProps) {
  const getConfidenceStyle = (confidence: number | null) => {
    if (confidence === null) return { bg: "bg-zinc-500/10", text: "text-zinc-600 dark:text-zinc-400", label: "Unmatched" };
    if (confidence >= 80) return { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", label: `High (${confidence}%)` };
    if (confidence >= 50) return { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", label: `Medium (${confidence}%)` };
    return { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", label: `Low (${confidence}%)` };
  };

  const confidenceStyle = getConfidenceStyle(event.matchConfidence);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        "p-4 rounded-xl border border-border/50",
        "bg-gradient-to-r from-muted/30 to-transparent",
        "hover:border-border hover:shadow-md transition-all duration-200"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {event.eventCategory && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                {event.eventCategory.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </span>
            )}
            {event.eventStartDate && (
              <span className="text-xs text-muted-foreground">
                {new Date(event.eventStartDate).toLocaleDateString()}
              </span>
            )}
            {event.impactDurationHours && (
              <span className="text-xs text-muted-foreground">
                {event.impactDurationHours}h impact
              </span>
            )}
          </div>
          <p className="font-medium text-foreground mb-2 line-clamp-2">{event.eventDescription}</p>
          {event.cpmActivityId && (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono text-primary">{event.cpmActivityId}</span>
              {event.cpmActivityDescription && (
                <>
                  <span className="text-muted-foreground">-</span>
                  <span className="text-muted-foreground truncate">{event.cpmActivityDescription}</span>
                </>
              )}
            </div>
          )}
          {event.matchReasoning && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-1" title={event.matchReasoning}>
              {event.matchReasoning}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className={cn(
            "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium",
            confidenceStyle.bg, confidenceStyle.text
          )}>
            {confidenceStyle.label}
          </span>
          <span className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-xs",
            event.verificationStatus === 'verified' 
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400"
          )}>
            {event.verificationStatus}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
