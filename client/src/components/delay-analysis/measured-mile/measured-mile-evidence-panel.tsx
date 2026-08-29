import { FileSearch, Database, Calculator, Filter, Layers } from "lucide-react";
import { GlassCard, SectionHeader } from "../ui/premium-components";
import type { MeasuredMileProvenanceDto } from "@/lib/measured-mile-api";

interface MeasuredMileEvidencePanelProps {
  provenance: MeasuredMileProvenanceDto;
}

/**
 * Always-visible justification layer: every figure on the chart must trace back to a formula with
 * real inputs, a named table with a row count, an explicit measured-vs-proxy tier, and the active
 * filters/exclusions that shaped the query. This is rendered directly from the provenance object
 * the query handler returns alongside the series -- nothing here is reconstructed client-side.
 */
export function MeasuredMileEvidencePanel({ provenance }: MeasuredMileEvidencePanelProps) {
  return (
    <GlassCard>
      <SectionHeader
        icon={FileSearch}
        title="Evidence & methodology"
        description="How every number on this chart was computed, and from what"
        gradient="teal"
      />
      <div className="p-6 space-y-6">
        <EvidenceSection icon={Database} label="Tables read">
          <ul className="space-y-1.5">
            {provenance.tablesRead.map((t, i) => (
              <li key={i} className="text-sm">
                <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{t.table}</span>
                <span className="text-muted-foreground"> — {t.rowCount.toLocaleString()} row{t.rowCount === 1 ? "" : "s"}</span>
                {t.note && <div className="text-xs text-muted-foreground pl-1">{t.note}</div>}
              </li>
            ))}
          </ul>
        </EvidenceSection>

        <EvidenceSection icon={Calculator} label="Formulas (with real inputs)">
          <dl className="space-y-2">
            {Object.entries(provenance.formulas).map(([key, formula]) => (
              <div key={key} className="text-sm">
                <dt className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                  {humanizeKey(key)}
                </dt>
                <dd className="font-mono text-xs text-foreground/90 mt-0.5">{formula}</dd>
              </div>
            ))}
          </dl>
        </EvidenceSection>

        <EvidenceSection icon={Layers} label="Measured vs. proxy tiers">
          <div className="flex flex-wrap gap-2">
            {Object.entries(provenance.measuredVsProxyTier).map(([key, tier]) => (
              <div
                key={key}
                className={`text-xs rounded-md px-2.5 py-1.5 border ${
                  tier.startsWith("measured")
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                    : "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
                }`}
              >
                <span className="font-medium">{humanizeKey(key)}:</span> {tier}
              </div>
            ))}
          </div>
        </EvidenceSection>

        <EvidenceSection icon={Filter} label="Active filters & exclusions">
          <div className="text-sm space-y-1">
            <div>
              Verified events only: <span className="font-medium">{provenance.activeFilters.verifiedOnly ? "Yes" : "No"}</span>
            </div>
            {provenance.activeFilters.wbsCodes.length > 0 && (
              <div>WBS filter: <span className="font-mono text-xs">{provenance.activeFilters.wbsCodes.join(", ")}</span></div>
            )}
            <div>Assumed shift length: <span className="font-medium">{provenance.activeFilters.shiftHours}h</span> (used only for the POD crew-hours proxy)</div>
            <div className="text-muted-foreground text-xs mt-2">
              Excluded units: {provenance.exclusions.excludedUnits.join(", ")} · Excluded by description keyword:{" "}
              {provenance.exclusions.excludedDescriptionKeywords.join(", ")}
            </div>
          </div>
        </EvidenceSection>

        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border/50">
          <div className="text-sm">
            <span className="text-muted-foreground">Measured-mile window: </span>
            <span className="font-medium">
              {provenance.measuredMileWindowSource === "auto_selected"
                ? "Auto-selected (longest, best-sustained unimpacted run)"
                : provenance.measuredMileWindowSource === "user_override"
                ? "User override"
                : "Not found (insufficient unimpacted periods)"}
            </span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Productivity proxy data: </span>
            <span className="font-medium">
              {provenance.hasProxyData
                ? `Available (${provenance.crosswalkCostCodeCount} crosswalked cost code${provenance.crosswalkCostCodeCount === 1 ? "" : "s"})`
                : "Unavailable for this item"}
            </span>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
            Data-quality summary (all periods)
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(provenance.dataQualitySummary).map(([status, count]) => (
              <span key={status} className="text-xs rounded-full px-2.5 py-1 bg-muted">
                {humanizeKey(status)}: {count}
              </span>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function EvidenceSection({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      {children}
    </div>
  );
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}
