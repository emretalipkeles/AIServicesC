import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, Download, CheckCircle, AlertCircle, Clock, TrendingUp } from "lucide-react";
import { useDelayEvents, getExportUrl } from "@/lib/analysis-api";
import { GlassCard, SectionHeader, StatCard } from "./ui/premium-components";
import { cn } from "@/lib/utils";

interface AnalysisResultsProps {
  projectId: string;
}

export function AnalysisResults({ projectId }: AnalysisResultsProps) {
  const { data: events = [], isLoading } = useDelayEvents(projectId);

  const matchedEvents = events.filter(e => e.cpmActivityId !== null);
  const highConfidence = matchedEvents.filter(e => (e.matchConfidence ?? 0) >= 80);
  const mediumConfidence = matchedEvents.filter(e => {
    const conf = e.matchConfidence ?? 0;
    return conf >= 50 && conf < 80;
  });
  const lowConfidence = matchedEvents.filter(e => {
    const conf = e.matchConfidence ?? 0;
    return conf > 0 && conf < 50;
  });

  const handleExport = () => {
    window.open(getExportUrl(projectId), "_blank");
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total Events" value={events.length} icon={BarChart3} />
        <StatCard label="Matched" value={matchedEvents.length} icon={CheckCircle} color="success" />
        <StatCard label="Unmatched" value={events.length - matchedEvents.length} icon={AlertCircle} color="warning" />
        <StatCard label="High Confidence" value={highConfidence.length} icon={TrendingUp} color="success" />
      </div>

      <GlassCard>
        <SectionHeader 
          icon={BarChart3} 
          title="Analysis Results" 
          description="Delay events matched to CPM schedule activities with confidence scores"
          gradient="blue"
          action={
            matchedEvents.length > 0 && (
              <Button onClick={handleExport} className="gap-2">
                <Download className="w-4 h-4" />
                Export to Excel
              </Button>
            )
          }
        />
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full"
              />
            </div>
          ) : matchedEvents.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                <BarChart3 className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-foreground mb-1">No matched results yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Run AI analysis after uploading documents and schedule to see matched delay events
              </p>
            </motion.div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted/20 rounded-xl">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400">{highConfidence.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">High Confidence (80%+)</div>
                </div>
                <div className="text-center border-x border-border/50">
                  <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">{mediumConfidence.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Medium (50-79%)</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600 dark:text-red-400">{lowConfidence.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Low (&lt;50%)</div>
                </div>
              </div>

              <ScrollArea className="h-[400px]">
                <div className="rounded-xl border border-border/50 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/50">
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">WBS</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Activity ID</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[150px]">Activity Description</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[200px]">Delay Event</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Event Date</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Duration</th>
                        <th className="text-left p-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence>
                        {matchedEvents.map((event, index) => (
                          <motion.tr
                            key={event.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: index * 0.02 }}
                            className="border-b border-border/30 hover:bg-muted/20 transition-colors group"
                          >
                            <td className="p-3 font-mono text-sm text-muted-foreground">{event.wbs || "-"}</td>
                            <td className="p-3 font-mono text-sm text-primary font-medium">{event.cpmActivityId}</td>
                            <td className="p-3 max-w-[150px] truncate text-sm" title={event.cpmActivityDescription || ""}>
                              {event.cpmActivityDescription || "-"}
                            </td>
                            <td className="p-3 max-w-[200px] text-sm">
                              <span className="line-clamp-2" title={event.eventDescription}>
                                {event.eventDescription}
                              </span>
                            </td>
                            <td className="p-3 text-sm text-muted-foreground">{formatDate(event.eventStartDate)}</td>
                            <td className="p-3 text-sm">
                              {event.impactDurationHours ? (
                                <span className="font-medium">{event.impactDurationHours}h</span>
                              ) : "-"}
                            </td>
                            <td className="p-3">
                              <ConfidenceBadge confidence={event.matchConfidence} />
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-600 dark:text-zinc-400">
        N/A
      </span>
    );
  }

  const style = confidence >= 80 
    ? "bg-green-500/10 text-green-600 dark:text-green-400 ring-1 ring-green-500/20"
    : confidence >= 50
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20"
      : "bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-red-500/20";

  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold", style)}>
      {confidence}%
    </span>
  );
}
