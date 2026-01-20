import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table as TableIcon, Download, FileSpreadsheet } from "lucide-react";
import { useDelayEvents, getExportUrl } from "@/lib/analysis-api";

interface AnalysisResultsProps {
  projectId: string;
}

export function AnalysisResults({ projectId }: AnalysisResultsProps) {
  const { data: events = [], isLoading } = useDelayEvents(projectId);

  const matchedEvents = events.filter(e => e.cpmActivityId !== null);

  const handleExport = () => {
    window.open(getExportUrl(projectId), "_blank");
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString();
  };

  const getConfidenceColor = (confidence: number | null) => {
    if (confidence === null) return "text-muted-foreground";
    if (confidence >= 80) return "text-green-600";
    if (confidence >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Analysis Results</CardTitle>
          <CardDescription>
            Delay events matched to CPM schedule activities with confidence scores
          </CardDescription>
        </div>
        {matchedEvents.length > 0 && (
          <Button onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export to Excel
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading results...
          </div>
        ) : matchedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <TableIcon className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">No matched results yet</h3>
            <p className="text-sm text-muted-foreground text-center">
              Run AI analysis after uploading documents and schedule to see matched delay events
            </p>
          </div>
        ) : (
          <>
            <div className="flex gap-4 mb-4 p-4 bg-muted rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Total Events</p>
                <p className="text-2xl font-bold">{events.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Matched</p>
                <p className="text-2xl font-bold text-green-600">{matchedEvents.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unmatched</p>
                <p className="text-2xl font-bold text-yellow-600">{events.length - matchedEvents.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">High Confidence</p>
                <p className="text-2xl font-bold">{matchedEvents.filter(e => (e.matchConfidence ?? 0) >= 80).length}</p>
              </div>
            </div>

            <ScrollArea className="h-[350px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>WBS</TableHead>
                    <TableHead>Activity ID</TableHead>
                    <TableHead className="min-w-[150px]">Activity Description</TableHead>
                    <TableHead className="min-w-[200px]">Delay Event</TableHead>
                    <TableHead>Event Date</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Reasoning</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matchedEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-mono text-sm">{event.wbs || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{event.cpmActivityId}</TableCell>
                      <TableCell className="max-w-[150px] truncate" title={event.cpmActivityDescription || ""}>
                        {event.cpmActivityDescription || "-"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={event.eventDescription}>
                        {event.eventDescription}
                      </TableCell>
                      <TableCell>{formatDate(event.eventStartDate)}</TableCell>
                      <TableCell>
                        {event.impactDurationHours ? `${event.impactDurationHours}h` : "-"}
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${getConfidenceColor(event.matchConfidence)}`}>
                          {event.matchConfidence}%
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate" title={event.matchReasoning || ""}>
                        {event.matchReasoning || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
