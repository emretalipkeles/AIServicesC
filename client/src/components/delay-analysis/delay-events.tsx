import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Activity, Play, Download, Loader2, DollarSign } from "lucide-react";
import { useDelayEvents, getExportUrl, runAnalysisWithProgress, fetchRunTokenUsage, type AnalysisProgressEvent, type RunTokenUsageSummary } from "@/lib/analysis-api";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface DelayEventsProps {
  projectId: string;
}

export function DelayEvents({ projectId }: DelayEventsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: events = [], isLoading, refetch } = useDelayEvents(projectId);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progressState, setProgressState] = useState<AnalysisProgressEvent | null>(null);
  const [lastRunCost, setLastRunCost] = useState<RunTokenUsageSummary | null>(null);

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

  const getConfidenceBadge = (confidence: number | null) => {
    if (confidence === null) return <Badge variant="outline">Unmatched</Badge>;
    if (confidence >= 80) return <Badge className="bg-green-600">High ({confidence}%)</Badge>;
    if (confidence >= 50) return <Badge className="bg-yellow-600">Medium ({confidence}%)</Badge>;
    return <Badge variant="destructive">Low ({confidence}%)</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Contractor Delay Events</CardTitle>
          <CardDescription>
            CODE_CIE entries extracted from Inspector Daily Reports and matched to schedule activities
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run AI Analysis
              </>
            )}
          </Button>
          {events.length > 0 && (
            <Button variant="outline" onClick={handleExport} disabled={isAnalyzing}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {progressState && (
          <div className="mb-6 p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="font-medium text-sm">{progressState.message}</p>
                {progressState.details?.current && progressState.details?.total && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Step {progressState.details.current} of {progressState.details.total}
                  </p>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {progressState.percentage || 0}%
              </span>
            </div>
            <Progress value={progressState.percentage || 0} className="h-2" />
          </div>
        )}

        {lastRunCost && (
          <div className="mb-6 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm text-green-700 dark:text-green-300">
              AI cost for this run: <span className="font-semibold">${lastRunCost.totalCostUsd.toFixed(4)}</span>
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading events...
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Activity className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">No delay events yet</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Upload IDRs with CODE_CIE tags and run AI analysis to extract delay events
            </p>
            <Button onClick={handleRunAnalysis} disabled={isAnalyzing}>
              <Play className="w-4 h-4 mr-2" />
              Run AI Analysis
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="min-w-[200px]">Event Description</TableHead>
                  <TableHead>Matched Activity</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>{formatDate(event.eventStartDate)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {getCategoryLabel(event.eventCategory)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate" title={event.eventDescription}>
                      {event.eventDescription}
                    </TableCell>
                    <TableCell>
                      {event.cpmActivityId ? (
                        <span className="font-mono text-sm">{event.cpmActivityId}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getConfidenceBadge(event.matchConfidence)}</TableCell>
                    <TableCell>
                      {event.impactDurationHours ? `${event.impactDurationHours}h` : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={event.verificationStatus === "verified" ? "default" : "outline"}>
                        {event.verificationStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
