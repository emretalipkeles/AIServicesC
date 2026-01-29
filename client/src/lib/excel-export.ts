import ExcelJS from "exceljs";

interface DelayEventData {
  wbs?: string | null;
  cpmActivityId?: string | null;
  cpmActivityDescription?: string | null;
  isCriticalPath?: string | null;
  totalFloat?: number | null;
  eventDescription: string;
  eventCategory?: string | null;
  eventStartDate?: string | null;
  impactDurationHours?: number | null;
  sourceReference?: string | null;
  sourceDocumentId?: string | null;
  extractedFromCode?: string | null;
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

function formatCategory(category: string | null | undefined): string {
  if (!category) return '';
  return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatCriticalPath(value: string | null | undefined): string {
  if (!value || value === 'unknown') return '';
  if (value === 'yes') return 'Yes';
  if (value === 'no') return 'No';
  return value;
}

export async function exportDelayEventsToExcel(
  events: DelayEventData[], 
  documentNameMap?: Map<string, string>
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Construction Delay Interpreter';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Delay Interpretation Results', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = [
    { header: 'WBS', key: 'wbs', width: 12 },
    { header: 'Activity ID', key: 'activityId', width: 15 },
    { header: 'Activity Description', key: 'activityDesc', width: 35 },
    { header: 'Critical Path', key: 'criticalPath', width: 12 },
    { header: 'Total Float', key: 'totalFloat', width: 12 },
    { header: 'Delay Event', key: 'eventDesc', width: 40 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Delay Duration estimate (hrs)', key: 'duration', width: 22 },
    { header: 'Source Document', key: 'sourceDoc', width: 30 },
    { header: 'Extracted From Code', key: 'extractedCode', width: 18 },
    { header: 'Source Reference', key: 'sourceRef', width: 25 },
    { header: 'Confidence', key: 'confidence', width: 12 },
    { header: 'Match Reasoning', key: 'reasoning', width: 45 },
    { header: 'Reviewer Approval', key: 'status', width: 18 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF3B82F6' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 28;

  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF3B82F6' } },
      bottom: { style: 'medium', color: { argb: 'FF3B82F6' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
  });

  events.forEach((event, index) => {
    const rowData = {
      wbs: event.wbs || '',
      activityId: event.cpmActivityId || '',
      activityDesc: event.cpmActivityDescription || '',
      criticalPath: formatCriticalPath(event.isCriticalPath),
      totalFloat: event.totalFloat ?? null,
      eventDesc: event.eventDescription,
      category: formatCategory(event.eventCategory),
      date: event.eventStartDate ? new Date(event.eventStartDate) : null,
      duration: event.impactDurationHours || null,
      sourceDoc: event.sourceDocumentId && documentNameMap ? documentNameMap.get(event.sourceDocumentId) || '' : '',
      extractedCode: event.extractedFromCode || '',
      sourceRef: event.sourceReference || '',
      confidence: event.matchConfidence ? `${event.matchConfidence}%` : '',
      reasoning: event.matchReasoning || '',
      status: event.verificationStatus,
    };

    const row = worksheet.addRow(rowData);
    const isEvenRow = index % 2 === 0;

    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isEvenRow ? 'FFFFFFFF' : 'FFF8FAFC' },
    };
    row.font = { color: { argb: 'FF1E293B' }, size: 10 };
    row.alignment = { vertical: 'middle', wrapText: true };
    row.height = 22;

    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if (colNumber === 4 || colNumber === 5 || colNumber === 9) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }

      if (colNumber === 7) {
        const formattedCategory = formatCategory(event.eventCategory);
        const colors = categoryColors[formattedCategory];
        if (colors) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: `FF${colors.bg}` },
          };
          cell.font = { color: { argb: `FF${colors.text}` }, size: 10, bold: true };
        }
      }

      if (colNumber === 13 && event.matchConfidence !== null && event.matchConfidence !== undefined) {
        const confidence = event.matchConfidence;
        let bgColor: string;
        let textColor: string;
        
        if (confidence < 50) {
          bgColor = 'FFFEE2E2';
          textColor = 'FFDC2626';
        } else if (confidence < 80) {
          bgColor = 'FFFEF3C7';
          textColor = 'FFB45309';
        } else {
          bgColor = 'FFD1FAE5';
          textColor = 'FF059669';
        }
        
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: bgColor },
        };
        cell.font = { color: { argb: textColor }, size: 10, bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
  });

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: events.length + 1, column: 15 },
  };

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const filename = `Delay-Analysis-Export-${dateStr}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { 
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
