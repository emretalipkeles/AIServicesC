import ExcelJS from 'exceljs';

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
  const worksheet = workbook.addWorksheet('Results');

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

  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true };

  events.forEach((event) => {
    worksheet.addRow([
      event.wbs || '',
      event.cpmActivityId || '',
      event.cpmActivityDescription || '',
      event.eventDescription,
      formatCategory(event.eventCategory),
      formatDate(event.eventStartDate),
      event.impactDurationHours || '',
      event.sourceReference || '',
      event.matchConfidence ? `${event.matchConfidence}%` : '',
      event.matchReasoning || '',
      event.verificationStatus,
    ]);
  });

  worksheet.columns.forEach((column, i) => {
    const widths = [10, 12, 30, 35, 18, 10, 12, 20, 10, 35, 12];
    column.width = widths[i] || 15;
  });

  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'project_analysis_results.xlsx';
  link.click();
}
