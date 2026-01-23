import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { BarChart3, Download, CheckCircle, AlertCircle, Clock, TrendingUp } from "lucide-react";
import { useDelayEvents } from "@/lib/analysis-api";
import { useProjectDocuments } from "@/lib/project-documents-api";
import { GlassCard, SectionHeader, StatCard, TableFilter, tableHeaderStyles, tableHeaderCellStyles, TruncatedTextWithTooltip } from "./ui/premium-components";
import { cn } from "@/lib/utils";
import { exportDelayEventsToExcel } from "@/lib/excel-export";

interface AnalysisResultsProps {
  projectId: string;
}

export function AnalysisResults({ projectId }: AnalysisResultsProps) {
  const { data: events = [], isLoading } = useDelayEvents(projectId);
  const { data: documents = [] } = useProjectDocuments(projectId);
  const [filterText, setFilterText] = useState("");

  const documentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    documents.forEach(doc => {
      map.set(doc.id, doc.filename);
    });
    return map;
  }, [documents]);

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

  const handleExport = async () => {
    await exportDelayEventsToExcel(events);
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

              <TableFilter
                value={filterText}
                onChange={setFilterText}
                placeholder="Filter by activity, WBS, or description..."
                className="max-w-md"
              />

              <div className="rounded-xl border border-border/50 overflow-auto max-h-[500px]">
                <table className="w-full text-sm">
                  <thead className={tableHeaderStyles}>
                    <tr>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>WBS</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>Activity ID</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs min-w-[120px]")}>Activity Desc.</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>Category</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs min-w-[160px]")}>Delay Event</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs min-w-[100px]")}>Source Ref.</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>Document</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs min-w-[120px]")}>Match Reason</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>Date</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>Dur.</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>Conf.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {matchedEvents
                        .filter(event => {
                          if (!filterText) return true;
                          const search = filterText.toLowerCase();
                          const docName = event.sourceDocumentId ? documentNameMap.get(event.sourceDocumentId) || "" : "";
                          return (
                            (event.wbs || "").toLowerCase().includes(search) ||
                            (event.cpmActivityId || "").toLowerCase().includes(search) ||
                            (event.cpmActivityDescription || "").toLowerCase().includes(search) ||
                            event.eventDescription.toLowerCase().includes(search) ||
                            (event.eventCategory || "").toLowerCase().includes(search) ||
                            (event.sourceReference || "").toLowerCase().includes(search) ||
                            (event.matchReasoning || "").toLowerCase().includes(search) ||
                            docName.toLowerCase().includes(search)
                          );
                        })
                        .map((event, index) => (
                          <motion.tr
                            key={event.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: index * 0.02 }}
                            className="border-b border-border/30 hover:bg-muted/20 transition-colors group"
                          >
                            <td className="p-2 font-mono text-xs text-muted-foreground">{event.wbs || "-"}</td>
                            <td className="p-2 font-mono text-xs text-primary font-medium">{event.cpmActivityId}</td>
                            <td className="p-2 max-w-[120px]">
                              <TruncatedTextWithTooltip 
                                text={event.cpmActivityDescription} 
                                maxWidth="120px"
                                className="text-xs"
                                label="Activity Description"
                              />
                            </td>
                            <td className="p-2">
                              {event.eventCategory ? (
                                <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary whitespace-nowrap">
                                  {event.eventCategory.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </span>
                              ) : "-"}
                            </td>
                            <td className="p-2 max-w-[160px]">
                              <TruncatedTextWithTooltip 
                                text={event.eventDescription} 
                                maxWidth="160px"
                                className="text-xs"
                                label="Delay Event"
                              />
                            </td>
                            <td className="p-2 max-w-[100px]">
                              <TruncatedTextWithTooltip 
                                text={event.sourceReference} 
                                maxWidth="100px"
                                className="text-xs text-muted-foreground"
                                label="Source Reference"
                              />
                            </td>
                            <td className="p-2 max-w-[100px]">
                              <TruncatedTextWithTooltip 
                                text={event.sourceDocumentId ? documentNameMap.get(event.sourceDocumentId) : null}
                                maxWidth="100px"
                                className="text-xs text-muted-foreground"
                                label="Source Document"
                              />
                            </td>
                            <td className="p-2 max-w-[120px]">
                              <TruncatedTextWithTooltip 
                                text={event.matchReasoning} 
                                maxWidth="120px"
                                className="text-xs text-muted-foreground"
                                label="Match Reasoning"
                              />
                            </td>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(event.eventStartDate)}</td>
                            <td className="p-2 text-xs">
                              {event.impactDurationHours ? (
                                <span className="font-medium">{event.impactDurationHours}h</span>
                              ) : "-"}
                            </td>
                            <td className="p-2">
                              <ConfidenceBadge confidence={event.matchConfidence} />
                            </td>
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
