export interface DocumentDateExtractionResult {
  date: Date | null;
  source: string | null;
}

export function extractDocumentDate(
  documentContent: string,
  documentType: string,
  filename: string
): DocumentDateExtractionResult {
  switch (documentType.toLowerCase()) {
    case 'idr':
      return extractIDRDate(documentContent);
    case 'ncr':
      return extractNCRDate(documentContent);
    case 'field_memo':
      return extractFieldMemoDate(documentContent);
    default:
      return extractGenericDate(documentContent, filename);
  }
}

function extractIDRDate(content: string): DocumentDateExtractionResult {
  const dayDatePatterns = [
    /Day\/Date:\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s/]*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,
    /Day\/Date:\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,
    /Report Date:\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,
    /Date:\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s/]*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,
  ];

  for (const pattern of dayDatePatterns) {
    const match = content.match(pattern);
    if (match) {
      const date = parseDateParts(match[1], match[2], match[3]);
      if (date) {
        return { date, source: 'IDR Day/Date field' };
      }
    }
  }

  return extractFromHeaderOrFilename(content, 'IDR');
}

function extractNCRDate(content: string): DocumentDateExtractionResult {
  const ncrPatterns = [
    /NCR Date:\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,
    /Date Issued:\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,
    /Issue Date:\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,
    /Report Date:\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,
    /Date:\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,
  ];

  for (const pattern of ncrPatterns) {
    const match = content.match(pattern);
    if (match) {
      const date = parseDateParts(match[1], match[2], match[3]);
      if (date) {
        return { date, source: 'NCR date field' };
      }
    }
  }

  return extractFromHeaderOrFilename(content, 'NCR');
}

function extractFieldMemoDate(content: string): DocumentDateExtractionResult {
  const memoPatterns = [
    /Memo Date:\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,
    /Field Memo Date:\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,
    /Date:\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,
    /Dated:\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,
  ];

  for (const pattern of memoPatterns) {
    const match = content.match(pattern);
    if (match) {
      const date = parseDateParts(match[1], match[2], match[3]);
      if (date) {
        return { date, source: 'Field memo date field' };
      }
    }
  }

  return extractFromHeaderOrFilename(content, 'Field Memo');
}

function extractGenericDate(content: string, filename: string): DocumentDateExtractionResult {
  const filenameResult = extractDateFromFilename(filename);
  if (filenameResult.date) {
    return filenameResult;
  }

  return extractFromHeaderOrFilename(content, 'Document');
}

const MONTH_NAMES: Record<string, number> = {
  'january': 1, 'jan': 1,
  'february': 2, 'feb': 2,
  'march': 3, 'mar': 3,
  'april': 4, 'apr': 4,
  'may': 5,
  'june': 6, 'jun': 6,
  'july': 7, 'jul': 7,
  'august': 8, 'aug': 8,
  'september': 9, 'sep': 9, 'sept': 9,
  'october': 10, 'oct': 10,
  'november': 11, 'nov': 11,
  'december': 12, 'dec': 12,
};

function extractFromHeaderOrFilename(content: string, docType: string): DocumentDateExtractionResult {
  const header = content.slice(0, 2000);
  
  const textualDatePatterns = [
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s]+(\w+)\s+(\d{1,2}),?\s+(\d{4})/i,
    /(\w+)\s+(\d{1,2}),?\s+(\d{4})/i,
    /(\d{1,2})\s+(\w+)\s+(\d{4})/i,
  ];

  for (const pattern of textualDatePatterns) {
    const match = header.match(pattern);
    if (match) {
      let month: number | undefined, day: number, year: number;
      
      if (/^\d+$/.test(match[1])) {
        day = parseInt(match[1], 10);
        month = MONTH_NAMES[match[2].toLowerCase()];
        year = parseInt(match[3], 10);
      } else {
        month = MONTH_NAMES[match[1].toLowerCase()];
        day = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
      }

      if (month && day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) {
          return { date, source: `${docType} header (textual date)` };
        }
      }
    }
  }
  
  const datePatterns = [
    /(\d{1,2})[./](\d{1,2})[./](\d{2,4})/,
    /(\d{4})-(\d{2})-(\d{2})/,
  ];

  for (const pattern of datePatterns) {
    const match = header.match(pattern);
    if (match) {
      if (pattern.source.includes('-')) {
        const date = parseDateParts(match[2], match[3], match[1]);
        if (date) {
          return { date, source: `${docType} header (ISO format)` };
        }
      } else {
        const date = parseDateParts(match[1], match[2], match[3]);
        if (date) {
          return { date, source: `${docType} header` };
        }
      }
    }
  }

  return { date: null, source: null };
}

function extractDateFromFilename(filename: string): DocumentDateExtractionResult {
  const patterns = [
    /_(\d{6})_/,
    /_(\d{2})(\d{2})(\d{2})_/,
    /-(\d{4})-?(\d{2})-?(\d{2})/,
    /_(\d{4})(\d{2})(\d{2})/,
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      if (match.length === 2 && match[1].length === 6) {
        const dateStr = match[1];
        const year = parseInt(dateStr.slice(0, 2), 10);
        const month = parseInt(dateStr.slice(2, 4), 10);
        const day = parseInt(dateStr.slice(4, 6), 10);
        const date = parseDateParts(month.toString(), day.toString(), year.toString());
        if (date) {
          return { date, source: 'Filename (YYMMDD format)' };
        }
      } else if (match.length === 4) {
        const date = parseDateParts(match[2], match[3], match[1]);
        if (date) {
          return { date, source: 'Filename' };
        }
      }
    }
  }

  return { date: null, source: null };
}

function parseDateParts(monthOrYear: string, dayOrMonth: string, yearOrDay: string): Date | null {
  try {
    let month: number, day: number, year: number;

    if (monthOrYear.length === 4) {
      year = parseInt(monthOrYear, 10);
      month = parseInt(dayOrMonth, 10);
      day = parseInt(yearOrDay, 10);
    } else {
      month = parseInt(monthOrYear, 10);
      day = parseInt(dayOrMonth, 10);
      year = parseInt(yearOrDay, 10);
      
      if (year < 100) {
        year = year >= 50 ? 1900 + year : 2000 + year;
      }
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) return null;

    return date;
  } catch {
    return null;
  }
}
