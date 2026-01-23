import ExcelJS from "exceljs";

interface DelayEventData {
  wbs?: string | null;
  cpmActivityId?: string | null;
  cpmActivityDescription?: string | null;
  eventDescription: string;
  eventCategory?: string | null;
  eventStartDate?: string | null;
  impactDurationHours?: number | null;
  sourceReference?: string | null;
  matchConfidence?: number | null;
  matchReasoning?: string | null;
  verificationStatus: string;
}

function formatCategory(category: string | null | undefined): string {
  if (!category) return '';
  return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return '';
  }
}

export async function exportDelayEventsToExcel(events: DelayEventData[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  const addSheet = (name: string, headers: string[], rows: string[][], wrapCols: number[] = []) => {
    const sheet = workbook.addWorksheet(name);
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };
    rows.forEach(row => sheet.addRow(row));
    sheet.columns.forEach((column, colIdx) => {
      let maxLength = headers[colIdx]?.length || 10;
      const shouldWrap = wrapCols.includes(colIdx);
      rows.forEach(row => {
        const cellValue = row[colIdx] || "";
        const lines = cellValue.split("\n");
        const longestLine = Math.max(...lines.map(l => l.length));
        if (longestLine > maxLength) maxLength = longestLine;
      });
      column.width = Math.min(maxLength + 2, shouldWrap ? 60 : 40);
      if (shouldWrap) {
        sheet.eachRow((row, rowNum) => {
          if (rowNum > 1) {
            const cell = row.getCell(colIdx + 1);
            cell.alignment = { wrapText: true, vertical: "top" };
          }
        });
      }
    });
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  };

  const headers = [
    'WBS',
    'Activity ID',
    'Activity Description',
    'Delay Event',
    'Category',
    'Date',
    'Duration (hrs)',
    'Source Reference',
    'Confidence',
    'Match Reasoning',
    'Status',
  ];

  const rows = events.map(event => [
    event.wbs || '',
    event.cpmActivityId || '',
    event.cpmActivityDescription || '',
    event.eventDescription,
    formatCategory(event.eventCategory),
    formatDate(event.eventStartDate),
    event.impactDurationHours?.toString() || '',
    event.sourceReference || '',
    event.matchConfidence ? `${event.matchConfidence}%` : '',
    event.matchReasoning || '',
    event.verificationStatus,
  ]);

  addSheet("Delay Analysis", headers, rows, [3, 9]);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { 
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "delay_analysis_export.xlsx";
  link.click();
  URL.revokeObjectURL(link.href);
}
