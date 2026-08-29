import {
  ComposedChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import type { MetricPointDto, PeriodClass, PointCitationDto } from "@/lib/measured-mile-api";

export type ChartMetric = "productionRatePerDay" | "earnedManHoursPerDay" | "productivityIndex";

const METRIC_LABELS: Record<ChartMetric, string> = {
  productionRatePerDay: "Production rate (units/day)",
  earnedManHoursPerDay: "Earned man-hours/day",
  productivityIndex: "Productivity index (proxy)",
};

const CLASS_COLORS: Record<PeriodClass, string> = {
  measured_mile: "#059669",
  impact: "#dc2626",
  acceleration: "#d97706",
  neutral: "#64748b",
  gap: "#cbd5e1",
};

const CLASS_LABELS: Record<PeriodClass, string> = {
  measured_mile: "Measured mile",
  impact: "Impacted",
  acceleration: "Directed acceleration",
  neutral: "Neutral",
  gap: "Data gap",
};

interface MeasuredMileChartProps {
  points: MetricPointDto[];
  metric: ChartMetric;
  windowRange: { startPeNumber: number; endPeNumber: number } | null;
  onPointClick?: (peNumber: number) => void;
  chartId?: string;
  citations?: PointCitationDto[];
}

export function MeasuredMileChart({ points, metric, windowRange, onPointClick, chartId, citations }: MeasuredMileChartProps) {
  const citationByPe = new Map((citations ?? []).map((c) => [c.peNumber, c]));
  const chartData = points.map((p) => ({
    peNumber: p.peNumber,
    label: `PE${p.peNumber}`,
    value: p.isGap ? null : p[metric],
    periodClass: p.periodClass,
    isGap: p.isGap,
    citation: citationByPe.get(p.peNumber) ?? null,
  }));

  return (
    <div id={chartId} className="w-full h-[380px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            label={{ value: METRIC_LABELS[metric], angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
          />
          <Tooltip content={<ChartTooltipRenderer metric={metric} />} />
          {windowRange && (
            <ReferenceArea
              x1={`PE${windowRange.startPeNumber}`}
              x2={`PE${windowRange.endPeNumber}`}
              fill="#059669"
              fillOpacity={0.08}
              stroke="#059669"
              strokeOpacity={0.3}
              strokeDasharray="4 2"
            />
          )}
          <Bar
            dataKey="value"
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
            onClick={(data: any) => onPointClick?.(data.peNumber)}
            style={{ cursor: onPointClick ? "pointer" : "default" }}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={CLASS_COLORS[entry.periodClass]} />
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
      {(Object.keys(CLASS_LABELS) as PeriodClass[]).map((cls) => (
        <div key={cls} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CLASS_COLORS[cls] }} />
          {CLASS_LABELS[cls]}
        </div>
      ))}
    </div>
  );
}

const METRIC_CITATION_KEY: Record<ChartMetric, keyof PointCitationDto> = {
  productionRatePerDay: "productionRatePerDay",
  earnedManHoursPerDay: "earnedManHours",
  productivityIndex: "productivityIndex",
};

function ChartTooltipRenderer({ active, payload, metric }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const citation: PointCitationDto | null = point.citation ?? null;
  const citationText = citation ? (citation[METRIC_CITATION_KEY[metric as ChartMetric]] as string | null) : null;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl max-w-xs">
      <div className="font-medium mb-1">{point.label}</div>
      {point.isGap ? (
        <div className="text-muted-foreground">{citation?.dataQuality ?? "No recoverable data for this period"}</div>
      ) : (
        <>
          <div>
            {METRIC_LABELS[metric as ChartMetric]}: <span className="font-mono font-medium">{point.value?.toFixed(2) ?? "—"}</span>
          </div>
          <div className="text-muted-foreground mt-0.5">{CLASS_LABELS[point.periodClass as PeriodClass]}</div>
          {citationText && <div className="text-muted-foreground mt-1.5 font-mono leading-snug whitespace-normal">{citationText}</div>}
          <div className="text-muted-foreground/70 mt-1.5 italic">Click bar for full evidence</div>
        </>
      )}
    </div>
  );
}
