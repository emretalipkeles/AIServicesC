import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Download, CheckCircle, AlertCircle, Clock, TrendingUp, CalendarRange, AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDelayEvents, type DelayEventDto } from "@/lib/analysis-api";
import { useProjectDocuments } from "@/lib/project-documents-api";
import { GlassCard, SectionHeader, StatCard, TableFilter, tableHeaderStyles, tableHeaderCellStyles, TruncatedTextWithTooltip, selectTriggerStyles } from "./ui/premium-components";
import { cn } from "@/lib/utils";
import { exportDelayEventsToExcel, isNoDelayEvent, formatSourceDocumentType } from "@/lib/excel-export";
import { formatDurationHours, formatDurationBasis, formatImpactedWindow } from "@/lib/format-duration";

interface AnalysisResultsProps {
  projectId: string;
}

const DELAY_EVENT_CONFIDENCE_THRESHOLD = 20;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ALL_PERIODS_VALUE = "all";

function periodKey(month: number, year: number): string {
  return `${year}-${month}`;
}

function getEventYearAndPeriod(eventStartDate: string | null): { year: number | null; period: string | null } {
  if (!eventStartDate) return { year: null, period: null };
  const d = new Date(eventStartDate);
  if (isNaN(d.getTime())) return { year: null, period: null };
  return { year: d.getFullYear(), period: MONTH_NAMES[d.getMonth()] };
}

/**
 * Mirrors ListDelayEventsQueryHandler's applyDateFilter on the server: field_memo/ncr sourced
 * events are not tied to a single reporting period, so they stay visible under every period
 * selection rather than being hidden when their (often absent/unrelated) event date doesn't
 * match. Kept in sync deliberately rather than reused, since this is client-side display
 * filtering rather than the server's authoritative period-scoped query.
 */
function matchesPeriod(event: DelayEventDto, month: number, year: number): boolean {
  if (event.sourceDocumentType === 'field_memo' || event.sourceDocumentType === 'ncr') {
    return true;
  }
  if (!event.eventStartDate) return false;
  const d = new Date(event.eventStartDate);
  return d.getMonth() + 1 === month && d.getFullYear() === year;
}

export function AnalysisResults({ projectId }: AnalysisResultsProps) {
  // The Results tab keeps its own period selection, independent of the Delay Events tab's
  // month/year selector (which drives "Run AI Analysis"). Fetching unfiltered lets us both
  // build the list of periods that actually have data and support an "All periods" view.
  const { data: allEvents = [], isLoading } = useDelayEvents(projectId);
  const { data: documents = [] } = useProjectDocuments(projectId);
  const [filterText, setFilterText] = useState("");
  const [periodSelection, setPeriodSelection] = useState<string>(ALL_PERIODS_VALUE);

  const availablePeriods = useMemo(() => {
    const seen = new Map<string, { month: number; year: number }>();
    allEvents.forEach(e => {
      if (!e.eventStartDate) return;
      const d = new Date(e.eventStartDate);
      if (isNaN(d.getTime())) return;
      const month = d.getMonth() + 1;
      const year = d.getFullYear();
      seen.set(periodKey(month, year), { month, year });
    });
    return Array.from(seen.values()).sort((a, b) => (b.year - a.year) || (b.month - a.month));
  }, [allEvents]);

  const events = useMemo(() => {
    if (periodSelection === ALL_PERIODS_VALUE) return allEvents;
    const [yearStr, monthStr] = periodSelection.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    return allEvents.filter(e => matchesPeriod(e, month, year));
  }, [allEvents, periodSelection]);

  const documentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    documents.forEach(doc => {
      map.set(doc.id, doc.filename);
    });
    return map;
  }, [documents]);

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      if (isNoDelayEvent(e.eventDescription)) {
        return false;
      }
      const confidence = e.delayEventConfidence;
      if (confidence !== null && confidence !== undefined && confidence < DELAY_EVENT_CONFIDENCE_THRESHOLD) {
        return false;
      }
      return true;
    });
  }, [events]);

  const matchedEvents = filteredEvents.filter(e => e.cpmActivityId !== null);
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
    await exportDelayEventsToExcel(filteredEvents, documentNameMap);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total Events" value={filteredEvents.length} icon={BarChart3} />
        <StatCard label="Matched" value={matchedEvents.length} icon={CheckCircle} color="success" />
        <StatCard label="Unmatched" value={filteredEvents.length - matchedEvents.length} icon={AlertCircle} color="warning" />
        <StatCard label="High Confidence" value={highConfidence.length} icon={TrendingUp} color="success" />
      </div>

      <GlassCard>
        <SectionHeader 
          icon={BarChart3} 
          title="Analysis Results" 
          description="Delay events matched to CPM schedule activities with confidence scores"
          gradient="blue"
          action={
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <CalendarRange className="w-4 h-4 text-muted-foreground" />
                <Select value={periodSelection} onValueChange={setPeriodSelection}>
                  <SelectTrigger className={cn(selectTriggerStyles, "w-[170px]")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_PERIODS_VALUE}>All Periods</SelectItem>
                    {availablePeriods.map(({ month, year }) => (
                      <SelectItem key={periodKey(month, year)} value={periodKey(month, year)}>
                        {MONTH_NAMES[month - 1]} {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {matchedEvents.length > 0 && (
                <Button onClick={handleExport} className="gap-2">
                  <Download className="w-4 h-4" />
                  Export to Excel
                </Button>
              )}
            </div>
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
                placeholder="Filter by activity or description..."
                className="max-w-md"
              />

              <div className="rounded-xl border border-border/50 overflow-auto max-h-[500px]">
                <table className="w-full text-sm">
                  <thead className={tableHeaderStyles}>
                    <tr>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>Activity ID</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs min-w-[120px]")}>Activity Desc.</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>Category</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs min-w-[160px]")}>Delay Event</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs min-w-[100px]")}>Source Ref.</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>Source Type</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>Document</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs min-w-[120px]")}>Match Reason</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs min-w-[130px]")}>POD Evidence</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs min-w-[130px]")}>Daily Report Evidence</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>Date</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>Year</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>Period</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs min-w-[130px]")}>Duration</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>Event Conf.</th>
                      <th className={cn(tableHeaderCellStyles, "text-xs")}>Match Conf.</th>
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
                            (event.podDocumentName || "").toLowerCase().includes(search) ||
                            (event.podUsageNote || "").toLowerCase().includes(search) ||
                            (event.diaryDocumentName || "").toLowerCase().includes(search) ||
                            (event.diaryUsageNote || "").toLowerCase().includes(search) ||
                            (event.diaryPageReference || "").toLowerCase().includes(search) ||
                            (event.rejectedBoundedClaimNote || "").toLowerCase().includes(search) ||
                            docName.toLowerCase().includes(search)
                          );
                        })
                        .map((event, index) => (
                          <motion.tr
                            key={event.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                            className="border-b border-border/30 hover:bg-muted/20 transition-colors group"
                          >
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
                            <td className="p-2">
                              {event.sourceDocumentType ? (
                                <span className={cn(
                                  "inline-flex px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap",
                                  event.sourceDocumentType === 'idr' && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                                  event.sourceDocumentType === 'ncr' && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
                                  event.sourceDocumentType === 'field_memo' && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                                  !['idr', 'ncr', 'field_memo'].includes(event.sourceDocumentType) && "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                )}>
                                  {formatSourceDocumentType(event.sourceDocumentType)}
                                </span>
                              ) : "-"}
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
                            <td className="p-2 max-w-[130px]">
                              <PodEvidenceCell podDocumentName={event.podDocumentName} podUsageNote={event.podUsageNote} />
                            </td>
                            <td className="p-2 max-w-[130px]">
                              <DiaryEvidenceCell
                                diaryDocumentName={event.diaryDocumentName}
                                diaryUsageNote={event.diaryUsageNote}
                                diaryPageReference={event.diaryPageReference}
                              />
                            </td>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(event.eventStartDate)}</td>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                              {getEventYearAndPeriod(event.eventStartDate).year ?? "-"}
                            </td>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                              {getEventYearAndPeriod(event.eventStartDate).period ?? "-"}
                            </td>
                            <td className="p-2 max-w-[130px]">
                              <DurationCell
                                hours={event.impactDurationHours}
                                windowStart={event.impactedWindowStart}
                                windowEnd={event.impactedWindowEnd}
                                basis={event.durationBasis}
                                rejectedBoundedClaimNote={event.rejectedBoundedClaimNote}
                              />
                            </td>
                            <td className="p-2">
                              <ConfidenceBadge confidence={event.delayEventConfidence} />
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

function PodEvidenceCell({
  podDocumentName,
  podUsageNote,
}: {
  podDocumentName: string | null;
  podUsageNote: string | null;
}) {
  // No POD document was ever attached to this event/match: visually distinct from a POD that
  // existed but did not corroborate, so "no POD available" and "POD available, not
  // corroborating" read differently at a glance. When multiple POD reports existed for the date
  // but none specifically corroborated this match, no single report can be honestly named — show
  // the explanatory note instead of guessing a document name.
  if (!podDocumentName) {
    return podUsageNote ? (
      <TruncatedTextWithTooltip
        text={podUsageNote}
        maxWidth="130px"
        className="text-[11px] text-muted-foreground italic"
        label="POD Usage"
      />
    ) : (
      <span className="text-xs text-muted-foreground/60 italic">No POD for date</span>
    );
  }

  const notCorroborating = !podUsageNote || /not corroborat|context only|no corroboration/i.test(podUsageNote);

  return (
    <div className="flex flex-col gap-0.5 max-w-[130px]">
      <TruncatedTextWithTooltip
        text={podDocumentName}
        maxWidth="130px"
        className={cn("text-xs font-medium", notCorroborating ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400")}
        label="POD Document"
      />
      <TruncatedTextWithTooltip
        text={podUsageNote || "POD context was available but did not corroborate this match."}
        maxWidth="130px"
        className="text-[11px] text-muted-foreground"
        label="POD Usage"
      />
    </div>
  );
}

function DiaryEvidenceCell({
  diaryDocumentName,
  diaryUsageNote,
  diaryPageReference,
}: {
  diaryDocumentName: string | null;
  diaryUsageNote: string | null;
  diaryPageReference: string | null;
}) {
  // Unlike POD, diary evidence never corroborates a specific match (it is never passed to the
  // activity matcher) — it only records whether foreman diary notes existed for this event's
  // date and were supplied to extraction as reference context. So there is no "corroborating vs
  // not" color distinction here, just "available" vs "not available for this date".
  if (!diaryDocumentName) {
    return diaryUsageNote ? (
      <TruncatedTextWithTooltip
        text={diaryUsageNote}
        maxWidth="130px"
        className="text-[11px] text-muted-foreground italic"
        label="Daily Report Usage"
      />
    ) : (
      <span className="text-xs text-muted-foreground/60 italic">No daily report for date</span>
    );
  }

  // Page reference lets a reviewer jump straight to the source page in the diary PDF instead
  // of searching a 70+ page document for the date; not always available (e.g. entries that
  // came from the AI-fallback path have no page attribution).
  const documentLabel = diaryPageReference ? `${diaryDocumentName} (${diaryPageReference})` : diaryDocumentName;
  const usageNoteText = diaryUsageNote || "Foreman diary notes were available for this date.";
  // Both lines in this cell get the same combined tooltip (document + page + usage note): a
  // reviewer hovering whichever line catches their eye first — often the usage note, since
  // it reads as the "explanation" — should never land on a tooltip that omits the page
  // reference just because they picked the other line.
  const combinedTooltip = `${documentLabel}\n\n${usageNoteText}`;

  return (
    <div className="flex flex-col gap-0.5 max-w-[130px]">
      <TruncatedTextWithTooltip
        text={documentLabel}
        tooltipText={combinedTooltip}
        maxWidth="130px"
        className="text-xs font-medium text-emerald-600 dark:text-emerald-400"
        label="Daily Report Evidence"
      />
      <TruncatedTextWithTooltip
        text={usageNoteText}
        tooltipText={combinedTooltip}
        maxWidth="130px"
        className="text-[11px] text-muted-foreground"
        label="Daily Report Evidence"
      />
    </div>
  );
}

function DurationCell({
  hours,
  windowStart,
  windowEnd,
  basis,
  rejectedBoundedClaimNote,
}: {
  hours: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  basis: string | null;
  rejectedBoundedClaimNote?: string | null;
}) {
  const window = formatImpactedWindow(windowStart, windowEnd);
  const hoursLabel = formatDurationHours(hours);
  const basisLabel = formatDurationBasis(basis);

  if (!window && !hoursLabel) {
    return <span className="text-xs text-muted-foreground/60 italic">No window recorded</span>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium whitespace-nowrap">
        {window ? `${window}${hoursLabel ? ` (${hoursLabel} h)` : ""}` : hoursLabel ? `${hoursLabel}h` : "-"}
      </span>
      {basisLabel ? (
        <span className="text-[11px] text-muted-foreground">{basisLabel}</span>
      ) : (
        <span className="text-[11px] text-muted-foreground/60 italic">basis not recorded</span>
      )}
      {/* A rejected 'bounded_by_next_entry' claim is otherwise invisible: the event just reads
          "AI estimate" at exactly the cap, so a reviewer has no way to tell a rejected timestamp
          claim caused it. A click-to-open badge (rather than a hover-only tooltip) makes the
          explanation discoverable without the reviewer needing to know to hover, and the badge
          itself — not just its contents — is always visible so the flag can't be missed. */}
      {rejectedBoundedClaimNote ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 self-start rounded px-1.5 py-0.5 text-[11px] font-medium",
                "bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 transition-colors"
              )}
            >
              <AlertTriangle className="w-3 h-3" />
              Capped
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            className="w-80 text-sm leading-relaxed bg-zinc-900/95 dark:bg-zinc-800/95 text-white border border-zinc-700/60 backdrop-blur-xl shadow-2xl"
          >
            {rejectedBoundedClaimNote}
          </PopoverContent>
        </Popover>
      ) : null}
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
