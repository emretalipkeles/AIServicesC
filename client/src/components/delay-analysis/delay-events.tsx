import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Play, Download, Loader2, DollarSign, CheckCircle, AlertCircle, Clock, Zap } from "lucide-react";
import { useDelayEvents, getExportUrl, runAnalysisWithProgress, fetchRunTokenUsage, type AnalysisProgressEvent, type RunTokenUsageSummary } from "@/lib/analysis-api";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { GlassCard, SectionHeader, ProgressIndicator, StatCard } from "./ui/premium-components";
import { cn } from "@/lib/utils";

interface DelayEventsProps {
  projectId: string;
}

export function DelayEvents({ projectId }: DelayEventsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: events = [], isLoading } = useDelayEvents(projectId);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressState, setProgressState] = useState<AnalysisProgressEvent | null>(null);
  const [lastRunCost, setLastRunCost] = useState<RunTokenUsageSummary | null>(null);

  const matchedEvents = events.filter(e => e.cpmActivityId !== null);
  const highConfidence = matchedEvents.filter(e => (e.matchConfidence ?? 0) >= 80);
  const pendingEvents = events.filter(e => e.verificationStatus === 'pending');

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setLastRunCost(null);
    setProgressState({
      type: 'progress',
      stage: 'loading_documents',
      message: 'Starting analysis...',
      percentage: 0,
    });

    try {
      const result = await runAnalysisWithProgress(
        projectId,
        { extractFromDocuments: true, matchToActivities: true },
        (event) => {
          setProgressState(event);
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

      if (result.runId) {
        try {
          const usage = await fetchRunTokenUsage(result.runId);
          if (usage) {
            setLastRunCost(usage);
          }
        } catch (costError) {
          console.error('Failed to fetch token usage:', costError);
        }
      }
    } catch (error) {
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Failed to run analysis",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
      setProgressState(null);
      queryClient.invalidateQueries({ queryKey: ["delay-events", projectId] });
    }
  };

  const handleExport = () => {
    window.open(getExportUrl(projectId), "_blank");
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
                  disabled={isAnalyzing}
                  className="gap-2 bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/25"
                >
                  {isAnalyzing ? (
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
                <Button variant="outline" onClick={handleExport} disabled={isAnalyzing} className="gap-2">
                  <Download className="w-4 h-4" />
                  Export CSV
                </Button>
              )}
            </div>
          }
        />
        <div className="p-6">
          {progressState && (
            <div className="mb-6">
              <ProgressIndicator
                stage={progressState.stage || ''}
                message={progressState.message}
                percentage={progressState.percentage || 0}
                details={progressState.details}
              />
            </div>
          )}

          {lastRunCost && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-3 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800 flex items-center gap-2"
            >
              <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-300">
                AI cost for this run: <span className="font-semibold">${lastRunCost.totalCostUsd.toFixed(4)}</span>
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
                <Button onClick={handleRunAnalysis} disabled={isAnalyzing} className="gap-2">
                  <Play className="w-4 h-4" />
                  Run AI Analysis
                </Button>
              </motion.div>
            </motion.div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                <AnimatePresence>
                  {events.map((event, index) => (
                    <EventCard key={event.id} event={event} index={index} />
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
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
