import { DetailDrawer } from "../ui/premium-components";
import type { LocationSeriesPointDto } from "@/lib/measured-mile-api";

interface MeasuredMileLocationDetailProps {
  location: LocationSeriesPointDto | null;
  onClose: () => void;
}

/**
 * Every location bar must expose its derivation: which periods contributed, which evidence rows
 * (POD task line vs schedule-activity fallback) resolved to this location and with what match
 * confidence, and any delay events forced onto this location-period pair. Rendered directly from
 * the location series result -- nothing here is reconstructed client-side.
 */
export function MeasuredMileLocationDetail({ location, onClose }: MeasuredMileLocationDetailProps) {
  return (
    <DetailDrawer
      isOpen={location !== null}
      onClose={onClose}
      title={location ? `${location.label} — derivation` : undefined}
      content={
        location ? (
          <div className="space-y-6 not-prose">
            <div className="text-sm text-muted-foreground">
              ~{location.approxDistanceFt.toLocaleString()} ft along corridor · confidence: {location.confidenceTier}
            </div>

            <Section title={`Contributing periods (${location.contributingPeriods.length})`}>
              {location.contributingPeriods.length === 0 ? (
                <EmptyNote>No pay-estimate period resolved evidence to this location.</EmptyNote>
              ) : (
                <ul className="space-y-3">
                  {location.contributingPeriods.map((p) => (
                    <li key={p.peNumber} className="text-sm border-l-2 border-border pl-3">
                      <div className="font-medium flex items-center gap-2">
                        PE{p.peNumber}
                        <span className="text-xs font-normal text-muted-foreground">
                          {p.periodClass}
                          {p.forcedImpactByLocationEvent && " (forced impact — delay event at this location)"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        allocated qty {p.allocatedQuantity.toFixed(2)} · weight share {(p.weightShare * 100).toFixed(0)}% · source: {p.sourceTypeUsed}
                        {p.allocatedWorkingDays !== null && ` · ${p.allocatedWorkingDays.toFixed(2)} working days`}
                      </div>
                      {p.evidence.length > 0 && (
                        <ul className="mt-1.5 space-y-1">
                          {p.evidence.map((e, i) => (
                            <li key={i} className="text-xs text-muted-foreground pl-2 border-l border-border/50">
                              <span className="font-mono">"{e.rawText}"</span> — {e.sourceType === "pod_task_line" ? "POD task line" : "schedule activity"}
                              {e.documentName ? ` (${e.documentName})` : ""} · match: {e.matchType}/{e.matchConfidence}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title={`Delay events overlaid (${location.overlaidDelayEvents.length})`}>
              {location.overlaidDelayEvents.length === 0 ? (
                <EmptyNote>No delay events with a matching WBS/location tag.</EmptyNote>
              ) : (
                <ul className="space-y-2">
                  {location.overlaidDelayEvents.map((e) => (
                    <li key={e.eventId} className="text-sm border-l-2 border-red-500/50 pl-3">
                      <div className="font-medium">{e.eventDescription}</div>
                      <div className="text-xs text-muted-foreground">
                        {[e.wbs, e.eventStartDate, e.impactDurationHours ? `${e.impactDurationHours}h` : null]
                          .filter(Boolean)
                          .join(" · ")}
                        {e.overlapsProductionPeriod ? "" : " — no overlap with a production period at this location"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
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
