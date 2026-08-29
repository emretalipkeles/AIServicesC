import { Loader2 } from "lucide-react";
import { DetailDrawer } from "../ui/premium-components";
import { useMeasuredMilePeriodDetail, type PointCitationDto } from "@/lib/measured-mile-api";

interface MeasuredMilePeriodDetailProps {
  projectId: string;
  peNumber: number | null;
  onClose: () => void;
  verifiedOnly: boolean;
  wbsCodes?: string[];
  citation?: PointCitationDto | null;
}

export function MeasuredMilePeriodDetail({ projectId, peNumber, onClose, verifiedOnly, wbsCodes, citation }: MeasuredMilePeriodDetailProps) {
  const { data, isLoading, error } = useMeasuredMilePeriodDetail(projectId, peNumber, { verifiedOnly, wbsCodes });

  return (
    <DetailDrawer
      isOpen={peNumber !== null}
      onClose={onClose}
      title={peNumber ? `Pay Estimate ${peNumber} detail` : undefined}
      content={
        isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">Failed to load period detail.</div>
        ) : data ? (
          <div className="space-y-6 not-prose">
            <div className="text-sm text-muted-foreground">
              {data.periodStart && data.periodEnd ? `${data.periodStart} — ${data.periodEnd}` : "Date range unavailable"}
            </div>

            {citation && (
              <Section title="How each chart figure was computed for this period">
                <div className="space-y-2 text-xs font-mono bg-muted/50 rounded-lg p-3">
                  {citation.installedQuantity && <div><span className="text-muted-foreground font-sans">Installed quantity: </span>{citation.installedQuantity}</div>}
                  {citation.earnedManHours && <div><span className="text-muted-foreground font-sans">Earned man-hours: </span>{citation.earnedManHours}</div>}
                  {citation.productionRatePerDay && <div><span className="text-muted-foreground font-sans">Production rate/day: </span>{citation.productionRatePerDay}</div>}
                  {citation.actualProxyHours && <div><span className="text-muted-foreground font-sans">Proxy hours (Tier 3): </span>{citation.actualProxyHours}</div>}
                  {citation.productivityIndex && <div><span className="text-muted-foreground font-sans">Productivity index: </span>{citation.productivityIndex}</div>}
                  <div><span className="text-muted-foreground font-sans">Data quality: </span>{citation.dataQuality}</div>
                </div>
              </Section>
            )}

            <Section title={`Delay events (${data.delayEvents.length})`}>
              {data.delayEvents.length === 0 ? (
                <EmptyNote>No delay events overlap this period.</EmptyNote>
              ) : (
                <ul className="space-y-2">
                  {data.delayEvents.map((e) => (
                    <li key={e.id} className="text-sm border-l-2 border-border pl-3">
                      <div className="font-medium">{e.eventDescription}</div>
                      <div className="text-xs text-muted-foreground">
                        {[e.eventCategory, e.eventStartDate, e.impactDurationHours ? `${e.impactDurationHours}h` : null, e.verificationStatus]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={`Schedule activities active (${data.scheduleActivities.length})`}>
              {data.scheduleActivities.length === 0 ? (
                <EmptyNote>No schedule activities recorded active in this window.</EmptyNote>
              ) : (
                <ul className="space-y-1.5">
                  {data.scheduleActivities.map((a) => (
                    <li key={a.activityId} className="text-sm">
                      <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded mr-1.5">{a.activityId}</span>
                      {a.activityDescription}
                      {a.isCriticalPath === "yes" && <span className="ml-1.5 text-xs text-red-600">(critical path)</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Foreman diary coverage">
              {data.diaryContext.length === 0 ? (
                <EmptyNote>No foreman diary entries found for this period.</EmptyNote>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.diaryContext.map((d, i) => (
                    <li key={i}>
                      {d.reportDate} — {d.documentName || "diary"} ({d.entryCount} entr{d.entryCount === 1 ? "y" : "ies"})
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Plan of the Day coverage">
              {data.podContext.length === 0 ? (
                <EmptyNote>No POD reports found for this period.</EmptyNote>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.podContext.map((p, i) => (
                    <li key={i}>
                      {p.reportDate} — {p.documentName || "POD"} ({p.crewSectionCount} crew section{p.crewSectionCount === 1 ? "" : "s"})
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Citations">
              <ul className="text-xs text-muted-foreground space-y-1">
                {data.citations.map((c, i) => (
                  <li key={i}>
                    {c.documentName} — {c.note}
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        ) : null
      }
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</h4>
      {children}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground italic">{children}</div>;
}
