import { Gauge, Loader2 } from "lucide-react";
import { GlassCard, SectionHeader } from "../ui/premium-components";
import { useJobWideProductivity } from "@/lib/measured-mile-api";

interface JobWideProductivityCardProps {
  projectId: string;
}

/**
 * Job-wide Tier 1/2 measured productivity factor -- payroll minus force-account hours vs. earned
 * man-hours. Cannot be split per bid item (no crosswalk exists between payroll/FA rows and bid
 * items), so it is shown as a separate, clearly labeled project-level reference metric.
 */
export function JobWideProductivityCard({ projectId }: JobWideProductivityCardProps) {
  const { data, isLoading, error } = useJobWideProductivity(projectId);

  if (isLoading) {
    return (
      <GlassCard>
        <div className="p-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </GlassCard>
    );
  }

  if (error || !data) {
    return (
      <GlassCard>
        <div className="p-6 text-sm text-muted-foreground">Job-wide productivity factor unavailable.</div>
      </GlassCard>
    );
  }

  const validPoints = data.points.filter((p) => p.productivityFactor !== null);
  const latest = validPoints[validPoints.length - 1];
  const avgFactor = validPoints.length
    ? validPoints.reduce((sum, p) => sum + (p.productivityFactor ?? 0), 0) / validPoints.length
    : null;

  return (
    <GlassCard>
      <SectionHeader
        icon={Gauge}
        title="Job-wide measured productivity factor"
        description="Tier 1/2 measured — payroll and force-account hours, not a proxy. Job-wide only: no bid-item crosswalk exists."
        gradient="purple"
      />
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric label="Latest period" value={latest ? `PE${latest.peNumber}` : "—"} />
          <Metric label="Latest factor" value={latest?.productivityFactor !== null && latest?.productivityFactor !== undefined ? latest.productivityFactor.toFixed(2) : "—"} />
          <Metric label="Job-to-date avg" value={avgFactor !== null ? avgFactor.toFixed(2) : "—"} />
          <Metric
            label="Latest disruption intensity"
            value={latest?.disruptionIntensityPct !== null && latest?.disruptionIntensityPct !== undefined ? `${(latest.disruptionIntensityPct * 100).toFixed(1)}%` : "—"}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Productivity factor = total earned man-hours ÷ base-contract hours (direct payroll hours minus force-account
          hours). 1.0 = performing exactly to the budgeted rate; below 1.0 means more hours were consumed than budgeted.
        </p>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium">Formula & limitation</summary>
          <div className="mt-2 space-y-1">
            {Object.entries(data.provenance.formulas).map(([key, formula]) => (
              <div key={key} className="font-mono">{formula}</div>
            ))}
            <div className="pt-1 italic">{data.provenance.limitation}</div>
          </div>
        </details>
      </div>
    </GlassCard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}
