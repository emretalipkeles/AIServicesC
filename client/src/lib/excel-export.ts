import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

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

const categoryColors: Record<string, { bg: string; text: string }> = {
  'Weather': { bg: 'DBEAFE', text: '1E40AF' },
  'Labor Related': { bg: 'FEE2E2', text: 'DC2626' },
  'Materials Equipment': { bg: 'FEF3C7', text: 'D97706' },
  'Site Management Safety': { bg: 'D1FAE5', text: '059669' },
  'Utility Infrastructure': { bg: 'E0E7FF', text: '4F46E5' },
  'Quality Rework': { bg: 'FCE7F3', text: 'DB2777' },
  'Planning Mobilization': { bg: 'DBEAFE', text: '2563EB' },
  'Third Party': { bg: 'F3E8FF', text: '9333EA' },
  'Owner Related': { bg: 'FCE7F3', text: 'EC4899' },
  'Subcontractor': { bg: 'CFFAFE', text: '0891B2' },
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
}

function formatCategory(category: string | null | undefined): string {
  if (!category) return '';
  return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export function exportDelayEventsToExcel(events: DelayEventData[]): void {
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

  const data = events.map(event => [
    event.wbs || '',
    event.cpmActivityId || '',
    event.cpmActivityDescription || '',
    event.eventDescription,
    formatCategory(event.eventCategory),
    formatDate(event.eventStartDate),
    event.impactDurationHours != null ? event.impactDurationHours : '',
    event.sourceReference || '',
    event.matchConfidence != null ? `${event.matchConfidence}%` : '',
    event.matchReasoning || '',
    event.verificationStatus,
  ]);

  const wsData = [headers, ...data];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const colWidths = [
    { wch: 12 },
    { wch: 15 },
    { wch: 35 },
    { wch: 40 },
    { wch: 22 },
    { wch: 12 },
    { wch: 14 },
    { wch: 25 },
    { wch: 12 },
    { wch: 45 },
    { wch: 14 },
  ];
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: 'Delay Analysis Export',
    Author: 'Data First - Delay Analysis',
    CreatedDate: new Date(),
  };

  XLSX.utils.book_append_sheet(wb, ws, 'Delay Analysis Results');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const filename = `Delay-Analysis-Export-${dateStr}.xlsx`;

  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, filename);
}
