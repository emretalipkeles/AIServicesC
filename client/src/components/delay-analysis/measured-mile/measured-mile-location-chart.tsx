import {
  ComposedChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { LocationSeriesPointDto, PeriodClass, LocationConfidenceTier } from "@/lib/measured-mile-api";

export type LocationChartMetric = "productionRatePerDay" | "totalAllocatedEarnedManHours" | "totalAllocatedQuantity";
export type LocationAxisLabelMode = "streetName" | "distance";

const METRIC_LABELS: Record<LocationChartMetric, string> = {
  productionRatePerDay: "Production rate (units/day)",
  totalAllocatedEarnedManHours: "Allocated earned man-hours",
  totalAllocatedQuantity: "Allocated installed quantity",
};

const CLASS_COLORS: Record<PeriodClass | "no_data", string> = {
  measured_mile: "#059669",
  impact: "#dc2626",
  acceleration: "#d97706",
  neutral: "#64748b",
  gap: "#cbd5e1",
  no_data: "#e5e7eb",
};

const CLASS_LABELS: Record<PeriodClass | "no_data", string> = {
  measured_mile: "Measured mile",
  impact: "Impacted",
  acceleration: "Directed acceleration",
  neutral: "Neutral",
  gap: "Data gap",
  no_data: "No data",
};

const CONFIDENCE_OPACITY: Record<LocationConfidenceTier, number> = {
  measured: 1,
  estimated: 0.75,
  thin: 0.45,
  no_data: 0.2,
};

interface MeasuredMileLocationChartProps {
  locations: LocationSeriesPointDto[];
  metric: LocationChartMetric;
  axisLabelMode: LocationAxisLabelMode;
  onPointClick?: (locationKey: string) => void;
  chartId?: string;
}

export function MeasuredMileLocationChart({ locations, metric, axisLabelMode, onPointClick, chartId }: MeasuredMileLocationChartProps) {
  const chartData = locations.map((loc) => ({
    key: loc.key,
    label: axisLabelMode === "streetName" ? loc.label : `${loc.approxDistanceFt.toLocaleString()} ft`,
    value: loc.dominantPeriodClass === "no_data" ? null : loc[metric],
    dominantPeriodClass: loc.dominantPeriodClass,
    confidenceTier: loc.confidenceTier,
    hasDelayEvent: loc.overlaidDelayEvents.length > 0,
    loc,
  }));

  return (
    <div id={chartId} className="w-full h-[380px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            interval={0}
            angle={-40}
            textAnchor="end"
            height={70}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            label={{ value: METRIC_LABELS[metric], angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
          />
          <Tooltip content={<LocationTooltipRenderer metric={metric} />} />
          <Bar
            dataKey="value"
            radius={[3, 3, 0, 0]}
            maxBarSize={26}
            onClick={(data: any) => onPointClick?.(data.key)}
            style={{ cursor: onPointClick ? "pointer" : "default" }}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={CLASS_COLORS[entry.dominantPeriodClass]}
                fillOpacity={CONFIDENCE_OPACITY[entry.confidenceTier]}
                stroke={entry.hasDelayEvent ? "#dc2626" : undefined}
                strokeWidth={entry.hasDelayEvent ? 2 : 0}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend />
    </div>
  );
}

function ChartLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
      {(Object.keys(CLASS_LABELS) as Array<PeriodClass | "no_data">).map((cls) => (
        <div key={cls} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CLASS_COLORS[cls] }} />
          {CLASS_LABELS[cls]}
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm border-2 border-red-600" />
        Delay event overlaid
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm bg-foreground/70 opacity-45" />
        Faded = lower confidence
      </div>
    </div>
  );
}

function LocationTooltipRenderer({ active, payload, metric }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const loc: LocationSeriesPointDto = point.loc;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl max-w-xs">
      <div className="font-medium mb-1">{loc.label}</div>
      <div className="text-muted-foreground mb-1">~{loc.approxDistanceFt.toLocaleString()} ft along corridor</div>
      {loc.dominantPeriodClass === "no_data" ? (
        <div className="text-muted-foreground">No allocable evidence for this location</div>
      ) : (
        <>
          <div>
            {METRIC_LABELS[metric as LocationChartMetric]}: <span className="font-mono font-medium">{(point.value as number | null)?.toFixed(2) ?? "—"}</span>
          </div>
          <div className="text-muted-foreground mt-0.5">
            {CLASS_LABELS[loc.dominantPeriodClass]} · confidence: {loc.confidenceTier}
          </div>
          {loc.overlaidDelayEvents.length > 0 && (
            <div className="text-red-600 dark:text-red-400 mt-1">{loc.overlaidDelayEvents.length} delay event(s) overlaid</div>
          )}
          <div className="text-muted-foreground/70 mt-1.5 italic">Click bar for full evidence</div>
        </>
      )}
    </div>
  );
}
