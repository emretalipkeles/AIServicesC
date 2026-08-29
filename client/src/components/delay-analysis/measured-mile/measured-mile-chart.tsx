import {
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import type { MetricPointDto, PeriodClass, PointCitationDto } from "@/lib/measured-mile-api";
import {
  buildChartRows,
  formatAxisValue,
  formatValue,
  CUMULATIVE_METRICS,
  METRIC_LABELS,
  type ChartMetric,
  type ChartRow,
  type TimeAxisMode,
} from "./measured-mile-chart-data";

export type { ChartMetric, TimeAxisMode } from "./measured-mile-chart-data";

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
  timeAxisMode?: TimeAxisMode;
  onPointClick?: (peNumber: number) => void;
  chartId?: string;
  citations?: PointCitationDto[];
  /** Same units as `productionRatePerDay` -- only meaningful (and only drawn) on that metric. */
  baselineRatePerDay?: number | null;
  impactedRatePerDay?: number | null;
}

export function MeasuredMileChart({
  points,
  metric,
  windowRange,
  timeAxisMode = "pe",
  onPointClick,
  chartId,
  citations,
  baselineRatePerDay = null,
  impactedRatePerDay = null,
}: MeasuredMileChartProps) {
  const { rows: chartData, allRows, excludedPointCount } = buildChartRows(points, metric, timeAxisMode, citations);
  const isTimeline = timeAxisMode === "timeline";
  // Final running tally of periods whose own contribution to a cumulative metric was unreported.
  const lowerBoundPeriodCount = allRows.length > 0 ? allRows[allRows.length - 1].unknownContributionCount : 0;

  const rowByPe = new Map(allRows.map((r) => [r.peNumber, r]));
  const windowStartRow = windowRange ? rowByPe.get(windowRange.startPeNumber) ?? null : null;
  const windowEndRow = windowRange ? rowByPe.get(windowRange.endPeNumber) ?? null : null;
  const windowBounds = isTimeline
    ? windowStartRow?.timestamp != null && windowEndRow?.timestamp != null
      ? { x1: windowStartRow.timestamp, x2: windowEndRow.timestamp }
      : null
    : windowStartRow && windowEndRow
      ? { x1: windowStartRow.label, x2: windowEndRow.label }
      : null;

  // Cumulative curves and the to-scale timeline both read as lines (the conventional measured-mile
  // exhibit); discrete per-period rates stay as bars on a categorical axis.
  const renderAsLine = isTimeline || CUMULATIVE_METRICS.includes(metric);

  return (
    <div id={chartId} className="w-full h-[380px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          {isTimeline ? (
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => format(new Date(v), "MMM-yy")}
              angle={-40}
              textAnchor="end"
              height={60}
            />
          ) : (
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              angle={timeAxisMode === "date" ? -40 : 0}
              textAnchor={timeAxisMode === "date" ? "end" : "middle"}
              height={timeAxisMode === "date" ? 60 : 30}
              // Date-label mode has one slot per pay estimate, and Recharts' default tick-thinning
              // picks slots by even pixel spacing, not by which slots actually have a bar/point --
              // a dense run of real periods can lose its dates while a sparse run of data gaps
              // keeps its own. Force every slot to be considered (interval=0) and only print the
              // date where this row actually has a plotted value; a value-less slot (data gap,
              // or a real period with no recoverable date) draws no label rather than a stray one.
              interval={timeAxisMode === "date" ? 0 : undefined}
              tickFormatter={timeAxisMode === "date" ? (value: string, index: number) => (chartData[index]?.value != null ? value : "") : undefined}
            />
          )}
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => formatAxisValue(metric, v)}
            label={{ value: METRIC_LABELS[metric], angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
          />
          <Tooltip content={<ChartTooltipRenderer metric={metric} />} />
          {windowBounds && (
            <ReferenceArea
              x1={windowBounds.x1 as any}
              x2={windowBounds.x2 as any}
              fill="#059669"
              fillOpacity={0.08}
              stroke="#059669"
              strokeOpacity={0.3}
              strokeDasharray="4 2"
            />
          )}
          {/* Baseline/impacted averages are computed from productionRatePerDay -- drawing them on
              any other metric's scale (dollars, man-hours, an index) would be a unit mismatch. */}
          {metric === "productionRatePerDay" && baselineRatePerDay != null && (
            <ReferenceLine
              y={baselineRatePerDay}
              stroke="#059669"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              ifOverflow="extendDomain"
              label={{
                value: `Baseline avg ${baselineRatePerDay.toFixed(2)}`,
                position: "insideTopRight",
                fill: "#059669",
                fontSize: 11,
              }}
            />
          )}
          {metric === "productionRatePerDay" && impactedRatePerDay != null && (
            <ReferenceLine
              y={impactedRatePerDay}
              stroke="#dc2626"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              ifOverflow="extendDomain"
              label={{
                value: `Impacted avg ${impactedRatePerDay.toFixed(2)}`,
                position: "insideBottomRight",
                fill: "#dc2626",
                fontSize: 11,
              }}
            />
          )}
          {renderAsLine ? (
            <Line
              type="monotone"
              dataKey="value"
              stroke="#475569"
              strokeWidth={1.5}
              // Deliberately NOT connectNulls: bridging a data gap or an unreported period would
              // draw progress the source documents never showed.
              connectNulls={false}
              isAnimationActive={false}
              dot={(props: any) => <ClassDot {...props} onPointClick={onPointClick} />}
              activeDot={{ r: 5 }}
            />
          ) : (
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
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend />
      {isTimeline && excludedPointCount > 0 && (
        <div className="text-xs text-amber-700 dark:text-amber-400 text-center mt-1">
          {excludedPointCount} period{excludedPointCount === 1 ? "" : "s"} have no recoverable date and cannot be placed on a
          to-scale timeline — switch to the PE or date-label axis to see them.
        </div>
      )}
      {isTimeline && windowRange && !windowBounds && (
        <div className="text-xs text-amber-700 dark:text-amber-400 text-center mt-1">
          The measured-mile window (PE{windowRange.startPeNumber}–PE{windowRange.endPeNumber}) is not shaded here because one of
          its boundary periods has no recoverable date — switch to the PE or date-label axis to see it.
        </div>
      )}
      {lowerBoundPeriodCount > 0 && (
        <div className="text-xs text-amber-700 dark:text-amber-400 text-center mt-1">
          Cumulative total is a lower bound: {lowerBoundPeriodCount} period{lowerBoundPeriodCount === 1 ? "" : "s"} reported no{" "}
          {metric === "cumulativeEarnedDollars" ? "earned dollars" : "earned man-hours"} and were left out rather than counted as
          zero.
        </div>
      )}
    </div>
  );
}

/** Line-mode marker, colored by the period's classification the same way the bars are. */
function ClassDot({ cx, cy, payload, onPointClick }: any) {
  if (cx == null || cy == null || payload?.value == null) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      fill={CLASS_COLORS[payload.periodClass as PeriodClass]}
      stroke="none"
      style={{ cursor: onPointClick ? "pointer" : "default" }}
      onClick={() => onPointClick?.(payload.peNumber)}
    />
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

/**
 * Cumulative and dollar metrics have no single-period citation of their own -- they are sums of
 * per-period figures -- so the tooltip falls back to the underlying per-period citation they are
 * derived from rather than claiming a citation that does not exist.
 */
const METRIC_CITATION_KEY: Record<ChartMetric, keyof PointCitationDto> = {
  productionRatePerDay: "productionRatePerDay",
  earnedManHoursPerDay: "earnedManHours",
  productivityIndex: "productivityIndex",
  earnedDollars: "installedQuantity",
  cumulativeEarnedDollars: "installedQuantity",
  cumulativeEarnedManHours: "earnedManHours",
};

function ChartTooltipRenderer({ active, payload, metric }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartRow | undefined;
  if (!point) return null;
  const citation: PointCitationDto | null = point.citation ?? null;
  const citationText = citation ? (citation[METRIC_CITATION_KEY[metric as ChartMetric]] as string | null) : null;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl max-w-xs">
      <div className="font-medium mb-1">
        PE{point.peNumber}
        {point.dateLabel && <span className="text-muted-foreground font-normal"> · {point.dateLabel}</span>}
      </div>
      {point.periodRangeLabel && <div className="text-muted-foreground/80 mb-1 font-mono">{point.periodRangeLabel}</div>}
      {point.isGap ? (
        <div className="text-muted-foreground">{citation?.dataQuality ?? "No recoverable data for this period"}</div>
      ) : (
        <>
          <div>
            {METRIC_LABELS[metric as ChartMetric]}:{" "}
            <span className="font-mono font-medium">
              {point.value != null
                ? `${point.valueIsLowerBound ? "≥ " : ""}${formatValue(metric as ChartMetric, point.value)}`
                : "—"}
            </span>
          </div>
          {point.valueIsLowerBound && (
            <div className="text-amber-700 dark:text-amber-400 mt-0.5">
              Excludes {point.unknownContributionCount} earlier period{point.unknownContributionCount === 1 ? "" : "s"} with an
              unreported amount.
            </div>
          )}
          <div className="text-muted-foreground mt-0.5">{CLASS_LABELS[point.periodClass as PeriodClass]}</div>
          {citationText && <div className="text-muted-foreground mt-1.5 font-mono leading-snug whitespace-normal">{citationText}</div>}
          <div className="text-muted-foreground/70 mt-1.5 italic">Click point for full evidence</div>
        </>
      )}
    </div>
  );
}
