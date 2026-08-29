import { saveAs } from "file-saver";
import type { MeasuredMileResultDto, MeasuredMileProvenanceDto, EligibleBidItemDto, PointCitationDto } from "@/lib/measured-mile-api";

/**
 * Exports the currently displayed series as CSV. Every row carries its own per-figure citation
 * (formula with this period's real numbers substituted in, plus named source documents) so a
 * reader can verify a number without re-opening the app -- a generic methodology appendix alone
 * is not sufficient evidence for an individual figure.
 */
export function exportMeasuredMileCsv(
  item: EligibleBidItemDto,
  result: MeasuredMileResultDto,
  provenance: MeasuredMileProvenanceDto,
  pointCitations: PointCitationDto[]
): void {
  const citationByPe = new Map(pointCitations.map((c) => [c.peNumber, c]));

  const headers = [
    "PE",
    "Period Start",
    "Period End",
    "Period Class",
    "Data Quality",
    "Installed Quantity",
    "Quantity Source",
    "Earned Man-Hours",
    "Production Rate/Day",
    "Actual Proxy Hours",
    "Productivity Index (proxy)",
    "Impact Hours",
    "Gap Reason",
    "Citation: Installed Quantity",
    "Citation: Earned Man-Hours",
    "Citation: Production Rate/Day",
    "Citation: Proxy Hours",
    "Citation: Productivity Index",
    "Citation: Data Quality",
  ];

  const rows = result.points.map((p) => {
    const c = citationByPe.get(p.peNumber);
    return [
      p.peNumber,
      p.periodStart ?? "",
      p.periodEnd ?? "",
      p.periodClass,
      p.dataQualityStatus,
      p.isGap ? "" : p.installedQuantity ?? "",
      p.isGap ? "" : p.quantityDeltaSource,
      p.isGap ? "" : p.earnedManHours ?? "",
      p.isGap ? "" : p.productionRatePerDay ?? "",
      p.isGap ? "" : p.actualProxyHours ?? "",
      p.isGap ? "" : p.productivityIndex ?? "",
      p.impactHours,
      p.gapReason ?? "",
      c?.installedQuantity ?? "",
      c?.earnedManHours ?? "",
      c?.productionRatePerDay ?? "",
      c?.actualProxyHours ?? "",
      c?.productivityIndex ?? "",
      c?.dataQuality ?? "",
    ];
  });

  const lines: string[] = [];
  lines.push(`Measured Mile export -- Bid item ${item.itemNo}: ${item.description ?? ""}`);
  lines.push(`Generated ${new Date().toISOString()}`);
  lines.push("");
  lines.push(headers.map(csvCell).join(","));
  for (const row of rows) {
    lines.push(row.map(csvCell).join(","));
  }
  lines.push("");
  lines.push("--- Sources & methodology (symbolic formulas; see per-row citation columns above for this item's actual substituted numbers) ---");
  for (const t of provenance.tablesRead) {
    lines.push(csvCell(`${t.table}: ${t.rowCount} rows${t.note ? " -- " + t.note : ""}`));
  }
  lines.push("");
  lines.push("--- Formulas ---");
  for (const [key, formula] of Object.entries(provenance.formulas)) {
    lines.push(csvCell(`${key}: ${formula}`));
  }
  lines.push("");
  lines.push("--- Measured vs. proxy tiers ---");
  for (const [key, tier] of Object.entries(provenance.measuredVsProxyTier)) {
    lines.push(csvCell(`${key}: ${tier}`));
  }
  lines.push("");
  lines.push(
    csvCell(
      `Active filters: verifiedOnly=${provenance.activeFilters.verifiedOnly}, shiftHours=${provenance.activeFilters.shiftHours}, wbsCodes=${provenance.activeFilters.wbsCodes.join("|") || "none"}`
    )
  );
  lines.push(
    csvCell(`Excluded units: ${provenance.exclusions.excludedUnits.join(", ")}; excluded keywords: ${provenance.exclusions.excludedDescriptionKeywords.join(", ")}`)
  );
  lines.push(csvCell(`Measured-mile window source: ${provenance.measuredMileWindowSource}`));

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  saveAs(blob, `measured-mile-item-${item.itemNo}.csv`);
}

function csvCell(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Builds the flat list of evidence lines appended beneath the exported chart image. */
function buildEvidenceAppendixLines(
  item: EligibleBidItemDto,
  result: MeasuredMileResultDto,
  provenance: MeasuredMileProvenanceDto
): string[] {
  const lines: string[] = [];
  lines.push(`Measured Mile -- Bid item ${item.itemNo}: ${item.description ?? "Unnamed item"}`);
  lines.push(`Generated ${new Date().toLocaleString()}`);
  lines.push("");
  lines.push("Sources:");
  for (const t of provenance.tablesRead) {
    lines.push(`  • ${t.table}: ${t.rowCount} rows${t.note ? " — " + t.note : ""}`);
  }
  lines.push("");
  lines.push("Formulas:");
  for (const [key, formula] of Object.entries(provenance.formulas)) {
    lines.push(`  • ${key}: ${formula}`);
  }
  lines.push("");
  lines.push("Measured vs. proxy tiers:");
  for (const [key, tier] of Object.entries(provenance.measuredVsProxyTier)) {
    lines.push(`  • ${key}: ${tier}`);
  }
  lines.push("");
  lines.push(
    `Active filters: verified events only = ${provenance.activeFilters.verifiedOnly}, shift hours = ${provenance.activeFilters.shiftHours}, WBS = ${
      provenance.activeFilters.wbsCodes.join(", ") || "none"
    }`
  );
  lines.push(`Excluded units: ${provenance.exclusions.excludedUnits.join(", ")}`);
  lines.push(`Excluded description keywords: ${provenance.exclusions.excludedDescriptionKeywords.join(", ")}`);
  lines.push(
    `Measured-mile window: ${
      result.measuredMileWindow ? `PE${result.measuredMileWindow.startPeNumber}-${result.measuredMileWindow.endPeNumber}` : "not found"
    } (${provenance.measuredMileWindowSource === "auto_selected" ? "auto-selected" : provenance.measuredMileWindowSource === "user_override" ? "user override" : "n/a"})`
  );
  lines.push(`Data quality summary: ${Object.entries(provenance.dataQualitySummary).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  return lines;
}

/**
 * Serializes the chart's SVG to a canvas and downloads it as a PNG, with the same
 * sources/formulas/filters evidence appendix as the CSV export rendered as text beneath the
 * chart -- an image of the chart alone cannot substantiate its own figures.
 */
export async function exportChartPng(
  chartElementId: string,
  filename: string,
  item: EligibleBidItemDto,
  result: MeasuredMileResultDto,
  provenance: MeasuredMileProvenanceDto
): Promise<void> {
  const container = document.getElementById(chartElementId);
  const svg = container?.querySelector("svg");
  if (!svg) {
    throw new Error("Chart not found for export");
  }

  const svgClone = svg.cloneNode(true) as SVGSVGElement;
  const bbox = svg.getBoundingClientRect();
  svgClone.setAttribute("width", String(bbox.width));
  svgClone.setAttribute("height", String(bbox.height));
  svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const computedBg = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const textColor = getComputedStyle(document.body).color || "#000000";
  const svgString = new XMLSerializer().serializeToString(svgClone);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
    });
    img.src = url;
    await loaded;

    const evidenceLines = buildEvidenceAppendixLines(item, result, provenance);
    const scale = 2;
    const fontSize = 12;
    const lineHeight = 16;
    const padding = 16;
    const appendixHeight = padding * 2 + evidenceLines.length * lineHeight;
    const totalHeight = bbox.height + appendixHeight;

    const canvas = document.createElement("canvas");
    canvas.width = bbox.width * scale;
    canvas.height = totalHeight * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.scale(scale, scale);
    ctx.fillStyle = computedBg;
    ctx.fillRect(0, 0, bbox.width, totalHeight);
    ctx.drawImage(img, 0, 0, bbox.width, bbox.height);

    ctx.fillStyle = textColor;
    ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textBaseline = "top";
    let y = bbox.height + padding;
    for (const line of evidenceLines) {
      ctx.fillText(line, padding, y, bbox.width - padding * 2);
      y += lineHeight;
    }

    await new Promise<void>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Failed to render PNG"));
          return;
        }
        saveAs(blob, filename);
        resolve();
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
