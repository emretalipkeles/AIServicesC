import { useState, useMemo } from "react";
import { Loader2, AlertTriangle, Download, Image as ImageIcon, TrendingUp, TrendingDown, Ruler, ListChecks, Clock, MapPin } from "lucide-react";
import { GlassCard, SectionHeader, StatCard, selectTriggerStyles } from "../ui/premium-components";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useEligibleMeasuredMileItems,
  useMeasuredMileSeries,
  useMeasuredMileLocationSeries,
  useSetAccelerationTag,
  useClearAccelerationTag,
  useSetMeasuredMileOverride,
  useClearMeasuredMileOverride,
} from "@/lib/measured-mile-api";
import { MeasuredMileChart, type ChartMetric } from "./measured-mile-chart";
import { MeasuredMileEvidencePanel } from "./measured-mile-evidence-panel";
import { MeasuredMilePeriodDetail } from "./measured-mile-period-detail";
import { MeasuredMileLocationChart, type LocationChartMetric, type LocationAxisLabelMode } from "./measured-mile-location-chart";
import { MeasuredMileLocationDetail } from "./measured-mile-location-detail";
import { CorridorLocationManager } from "./corridor-location-manager";
import { JobWideProductivityCard } from "./job-wide-productivity-card";
import { exportMeasuredMileCsv, exportChartPng } from "./measured-mile-export";

type XAxisMode = "time" | "location";

const LOCATION_METRIC_OPTIONS: Array<{ value: LocationChartMetric; label: string }> = [
  { value: "productionRatePerDay", label: "Production rate (units/day)" },
  { value: "totalAllocatedEarnedManHours", label: "Allocated earned man-hours" },
  { value: "totalAllocatedQuantity", label: "Allocated installed quantity" },
];

interface MeasuredMileTabProps {
  projectId: string;
}

const CHART_ID = "measured-mile-chart-svg-container";

const METRIC_OPTIONS: Array<{ value: ChartMetric; label: string }> = [
  { value: "productionRatePerDay", label: "Production rate (units/day)" },
  { value: "earnedManHoursPerDay", label: "Earned man-hours/day" },
  { value: "productivityIndex", label: "Productivity index (proxy)" },
];

export function MeasuredMileTab({ projectId }: MeasuredMileTabProps) {
  const { data: items = [], isLoading: itemsLoading } = useEligibleMeasuredMileItems(projectId);
  const [selectedItemNo, setSelectedItemNo] = useState<number | null>(null);
  const [xAxisMode, setXAxisMode] = useState<XAxisMode>("time");
  const [metric, setMetric] = useState<ChartMetric>("productionRatePerDay");
  const [locationMetric, setLocationMetric] = useState<LocationChartMetric>("productionRatePerDay");
  const [locationAxisLabelMode, setLocationAxisLabelMode] = useState<LocationAxisLabelMode>("streetName");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [shiftHours, setShiftHours] = useState(8);
  const [detailPeNumber, setDetailPeNumber] = useState<number | null>(null);
  const [detailLocationKey, setDetailLocationKey] = useState<string | null>(null);
  const [overrideStart, setOverrideStart] = useState("");
  const [overrideEnd, setOverrideEnd] = useState("");
  const { toast } = useToast();

  const activeItemNo = selectedItemNo ?? (items.length > 0 ? items[0].itemNo : null);

  const { data: seriesData, isLoading: seriesLoading, error: seriesError } = useMeasuredMileSeries(projectId, activeItemNo, {
    verifiedOnly,
    shiftHours,
  });

  const {
    data: locationSeriesData,
    isLoading: locationSeriesLoading,
    error: locationSeriesError,
  } = useMeasuredMileLocationSeries(projectId, xAxisMode === "location" ? activeItemNo : null, {
    verifiedOnly,
    shiftHours,
  });

  const setAcceleration = useSetAccelerationTag(projectId);
  const clearAcceleration = useClearAccelerationTag(projectId);
  const setOverride = useSetMeasuredMileOverride(projectId);
  const clearOverride = useClearMeasuredMileOverride(projectId);

  const activeItem = useMemo(() => items.find((i) => i.itemNo === activeItemNo) ?? null, [items, activeItemNo]);

  if (itemsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <GlassCard>
        <div className="p-8 text-center text-muted-foreground">
          No eligible direct-work bid items were found. Measured mile analysis needs installed-quantity progress data for at least one bid item.
        </div>
      </GlassCard>
    );
  }

  const series = seriesData?.series ?? null;
  const provenance = seriesData?.provenance ?? null;
  const selectedPoint = detailPeNumber !== null ? series?.points.find((p) => p.peNumber === detailPeNumber) ?? null : null;

  const handleToggleAcceleration = (peNumber: number, isCurrentlyTagged: boolean) => {
    if (!activeItemNo) return;
    const mutation = isCurrentlyTagged ? clearAcceleration : setAcceleration;
    mutation.mutate(
      { itemNo: activeItemNo, peNumber },
      {
        onError: () => toast({ title: "Error", description: "Failed to update acceleration tag", variant: "destructive" }),
      }
    );
  };

  const handleSetOverride = () => {
    if (!activeItemNo) return;
    const start = parseInt(overrideStart, 10);
    const end = parseInt(overrideEnd, 10);
    if (isNaN(start) || isNaN(end) || start > end) {
      toast({ title: "Invalid range", description: "Enter a valid start ≤ end pay-estimate range", variant: "destructive" });
      return;
    }
    setOverride.mutate(
      { itemNo: activeItemNo, startPeNumber: start, endPeNumber: end },
      {
        onSuccess: () => {
          toast({ title: "Measured mile window updated" });
          setOverrideStart("");
          setOverrideEnd("");
        },
        onError: () => toast({ title: "Error", description: "Failed to set measured mile window", variant: "destructive" }),
      }
    );
  };

  const handleClearOverride = () => {
    if (!activeItemNo) return;
    clearOverride.mutate(
      { itemNo: activeItemNo },
      {
        onSuccess: () => toast({ title: "Reverted to auto-selected window" }),
        onError: () => toast({ title: "Error", description: "Failed to clear measured mile window", variant: "destructive" }),
      }
    );
  };

  const handleExportCsv = () => {
    if (!activeItem || !series || !provenance || !seriesData) return;
    exportMeasuredMileCsv(activeItem, series, provenance, seriesData.pointCitations);
  };

  const handleExportPng = async () => {
    if (!activeItem || !series || !provenance) return;
    try {
      await exportChartPng(CHART_ID, `measured-mile-item-${activeItem.itemNo}.png`, activeItem, series, provenance);
    } catch {
      toast({ title: "Error", description: "Failed to export chart image", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <GlassCard>
        <SectionHeader
          icon={Ruler}
          title="Measured Mile — Productivity Over Time"
          description="Per bid item: how installed-quantity productivity moved across pay-estimate periods, with impacted periods and the auto-selected unimpacted baseline highlighted."
          gradient="blue"
        />
        <div className="p-6 space-y-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[280px]">
              <Label className="text-xs text-muted-foreground mb-1.5 block">Bid item</Label>
              <Select value={activeItemNo?.toString() ?? ""} onValueChange={(v) => setSelectedItemNo(Number(v))}>
                <SelectTrigger className={selectTriggerStyles}>
                  <SelectValue placeholder="Select a bid item" />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.itemNo} value={item.itemNo.toString()}>
                      {item.itemNo} — {item.description ?? "Unnamed item"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">X-axis</Label>
              <div className="flex rounded-lg border border-border/50 overflow-hidden">
                <button
                  onClick={() => setXAxisMode("time")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                    xAxisMode === "time" ? "bg-primary text-primary-foreground" : "bg-background/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" /> Time (PE)
                </button>
                <button
                  onClick={() => setXAxisMode("location")}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                    xAxisMode === "location" ? "bg-primary text-primary-foreground" : "bg-background/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" /> Street / distance
                </button>
              </div>
            </div>

            {xAxisMode === "time" ? (
              <div className="min-w-[220px]">
                <Label className="text-xs text-muted-foreground mb-1.5 block">Chart metric</Label>
                <Select value={metric} onValueChange={(v) => setMetric(v as ChartMetric)}>
                  <SelectTrigger className={selectTriggerStyles}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METRIC_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="min-w-[220px]">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Chart metric</Label>
                  <Select value={locationMetric} onValueChange={(v) => setLocationMetric(v as LocationChartMetric)}>
                    <SelectTrigger className={selectTriggerStyles}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCATION_METRIC_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[160px]">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Location label</Label>
                  <Select value={locationAxisLabelMode} onValueChange={(v) => setLocationAxisLabelMode(v as LocationAxisLabelMode)}>
                    <SelectTrigger className={selectTriggerStyles}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="streetName">Street name</SelectItem>
                      <SelectItem value="distance">Distance (ft)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="flex items-center gap-2 pb-2">
              <Switch id="verified-only" checked={verifiedOnly} onCheckedChange={setVerifiedOnly} />
              <Label htmlFor="verified-only" className="text-sm">Verified delay events only</Label>
            </div>

            <div className="w-28">
              <Label className="text-xs text-muted-foreground mb-1.5 block">Shift hours</Label>
              <Input
                type="number"
                min={1}
                max={24}
                step={0.5}
                value={shiftHours}
                onChange={(e) => setShiftHours(Number(e.target.value) || 8)}
                className="bg-background/50"
              />
            </div>

            {xAxisMode === "time" && (
              <>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!series} className="gap-1.5">
                  <Download className="w-4 h-4" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPng} disabled={!series} className="gap-1.5">
                  <ImageIcon className="w-4 h-4" /> PNG
                </Button>
              </>
            )}
          </div>

          {xAxisMode === "time" && (
            <>
              {seriesLoading && (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {seriesError && (
                <div className="flex items-center gap-2 text-sm text-destructive p-4">
                  <AlertTriangle className="w-4 h-4" /> Failed to compute measured mile series for this item.
                </div>
              )}

              {series && !seriesLoading && (
                <>
                  <DataQualityBanner points={series.points} />

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <StatCard
                      label="Measured mile window"
                      value={series.measuredMileWindow ? `PE${series.measuredMileWindow.startPeNumber}–${series.measuredMileWindow.endPeNumber}` : "Not found"}
                      icon={Ruler}
                      color="success"
                    />
                    <StatCard
                      label="Baseline rate/day"
                      value={series.lossStatistics.measuredMileBaselineRatePerDay?.toFixed(2) ?? "—"}
                      icon={TrendingUp}
                    />
                    <StatCard
                      label="Impacted rate/day"
                      value={series.lossStatistics.impactedAverageRatePerDay?.toFixed(2) ?? "—"}
                      icon={TrendingDown}
                      color={series.lossStatistics.impactedAverageRatePerDay !== null ? "danger" : "default"}
                    />
                    <StatCard
                      label="Est. lost man-hours (proxy)"
                      value={series.lossStatistics.hasProxyData && series.lossStatistics.estimatedLostManHours !== null
                        ? series.lossStatistics.estimatedLostManHours.toFixed(0)
                        : "No proxy data"}
                      icon={ListChecks}
                      color="warning"
                    />
                  </div>

                  <MeasuredMileChart
                    points={series.points}
                    metric={metric}
                    windowRange={series.measuredMileWindow}
                    onPointClick={setDetailPeNumber}
                    chartId={CHART_ID}
                    citations={seriesData?.pointCitations}
                  />

                  <WindowAndAccelerationControls
                    overrideStart={overrideStart}
                    overrideEnd={overrideEnd}
                    onOverrideStartChange={setOverrideStart}
                    onOverrideEndChange={setOverrideEnd}
                    onSetOverride={handleSetOverride}
                    onClearOverride={handleClearOverride}
                    hasOverride={series.measuredMileWindow ? !series.measuredMileWindow.isAutoSelected : false}
                    points={series.points}
                    onToggleAcceleration={handleToggleAcceleration}
                  />
                </>
              )}
            </>
          )}

          {xAxisMode === "location" && (
            <>
              {locationSeriesLoading && (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {locationSeriesError && (
                <div className="flex items-center gap-2 text-sm text-destructive p-4">
                  <AlertTriangle className="w-4 h-4" /> Failed to compute measured mile location series for this item.
                </div>
              )}

              {locationSeriesData && !locationSeriesLoading && (
                <>
                  {locationSeriesData.locationSeries.unallocatedPeriods.length > 0 && (
                    <div className="flex items-start gap-2 text-sm rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 px-4 py-3">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        {locationSeriesData.locationSeries.unallocatedPeriods.length} period(s) had no resolvable location
                        evidence and were left unallocated (quantity not fabricated): PE
                        {locationSeriesData.locationSeries.unallocatedPeriods.map((p) => p.peNumber).join(", PE")}.
                      </div>
                    </div>
                  )}

                  <MeasuredMileLocationChart
                    locations={locationSeriesData.locationSeries.locations}
                    metric={locationMetric}
                    axisLabelMode={locationAxisLabelMode}
                    onPointClick={setDetailLocationKey}
                  />
                </>
              )}
            </>
          )}
        </div>
      </GlassCard>

      {xAxisMode === "time" && series && provenance && <MeasuredMileEvidencePanel provenance={provenance} />}

      {xAxisMode === "location" && locationSeriesData && (
        <CorridorLocationManager projectId={projectId} unmatchedEvidenceSamples={locationSeriesData.locationSeries.unmatchedEvidenceSamples} />
      )}

      <JobWideProductivityCard projectId={projectId} />

      <MeasuredMilePeriodDetail
        projectId={projectId}
        peNumber={detailPeNumber}
        onClose={() => setDetailPeNumber(null)}
        verifiedOnly={verifiedOnly}
        citation={detailPeNumber !== null ? seriesData?.pointCitations.find((c) => c.peNumber === detailPeNumber) ?? null : null}
      />

      <MeasuredMileLocationDetail
        location={
          detailLocationKey !== null
            ? locationSeriesData?.locationSeries.locations.find((l) => l.key === detailLocationKey) ?? null
            : null
        }
        onClose={() => setDetailLocationKey(null)}
      />
    </div>
  );
}

function DataQualityBanner({ points }: { points: { dataQualityStatus: string; isGap: boolean }[] }) {
  const gapCount = points.filter((p) => p.isGap).length;
  const flaggedCount = points.filter(
    (p) => !p.isGap && (p.dataQualityStatus === "significant_discrepancy" || p.dataQualityStatus === "unvalidated")
  ).length;

  if (gapCount === 0 && flaggedCount === 0) return null;

  return (
    <div className="flex items-start gap-2 text-sm rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 px-4 py-3">
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div>
        {gapCount > 0 && <div>{gapCount} pay-estimate period{gapCount === 1 ? "" : "s"} rendered as an explicit data gap (unrecoverable source).</div>}
        {flaggedCount > 0 && <div>{flaggedCount} period{flaggedCount === 1 ? "" : "s"} flagged with lower confidence data quality — see the evidence panel below.</div>}
      </div>
    </div>
  );
}

function WindowAndAccelerationControls({
  overrideStart,
  overrideEnd,
  onOverrideStartChange,
  onOverrideEndChange,
  onSetOverride,
  onClearOverride,
  hasOverride,
  points,
  onToggleAcceleration,
}: {
  overrideStart: string;
  overrideEnd: string;
  onOverrideStartChange: (v: string) => void;
  onOverrideEndChange: (v: string) => void;
  onSetOverride: () => void;
  onClearOverride: () => void;
  hasOverride: boolean;
  points: Array<{ peNumber: number; isManualAcceleration: boolean; isGap: boolean }>;
  onToggleAcceleration: (peNumber: number, isCurrentlyTagged: boolean) => void;
}) {
  return (
    <div className="grid md:grid-cols-2 gap-4 pt-2 border-t border-border/50">
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Override measured-mile window (PE range)</Label>
        <div className="flex items-center gap-2">
          <Input placeholder="Start PE" value={overrideStart} onChange={(e) => onOverrideStartChange(e.target.value)} className="bg-background/50" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input placeholder="End PE" value={overrideEnd} onChange={(e) => onOverrideEndChange(e.target.value)} className="bg-background/50" />
          <Button size="sm" onClick={onSetOverride}>Apply</Button>
          {hasOverride && (
            <Button size="sm" variant="ghost" onClick={onClearOverride}>Reset to auto</Button>
          )}
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Tag directed acceleration (no data source — manual)</Label>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {points.filter((p) => !p.isGap).map((p) => (
            <button
              key={p.peNumber}
              onClick={() => onToggleAcceleration(p.peNumber, p.isManualAcceleration)}
              className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
                p.isManualAcceleration
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-700 dark:text-amber-400"
                  : "bg-muted border-border/50 text-muted-foreground hover:border-amber-500/40"
              }`}
            >
              PE{p.peNumber}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
