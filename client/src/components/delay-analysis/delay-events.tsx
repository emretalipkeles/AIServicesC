import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Play, Download, AlertTriangle } from "lucide-react";
import { useDelayEvents, useRunAnalysis, getExportUrl } from "@/lib/analysis-api";
import { useToast } from "@/hooks/use-toast";

interface DelayEventsProps {
  projectId: string;
}

export function DelayEvents({ projectId }: DelayEventsProps) {
  const { toast } = useToast();
  const { data: events = [], isLoading, refetch } = useDelayEvents(projectId);
  const runAnalysisMutation = useRunAnalysis();

  const handleRunAnalysis = async () => {
    try {
      const result = await runAnalysisMutation.mutateAsync({
        projectId,
        options: { extractFromDocuments: true, matchToActivities: true },
      });

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

      refetch();
    } catch (error) {
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Failed to run analysis",
        variant: "destructive",
      });
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
            disabled={runAnalysisMutation.isPending}
          >
            <Play className="w-4 h-4 mr-2" />
            {runAnalysisMutation.isPending ? "Analyzing..." : "Run AI Analysis"}
          </Button>
          {events.length > 0 && (
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
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
            <Button onClick={handleRunAnalysis} disabled={runAnalysisMutation.isPending}>
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
