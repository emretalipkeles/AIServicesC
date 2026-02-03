export function extractReportDateFromIDR(documentContent: string): Date | null {
  const dayDatePatterns = [
    /Day\/Date:\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /Day\/Date:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /Report Date:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /Date:\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i,
  ];

  for (const pattern of dayDatePatterns) {
    const match = documentContent.match(pattern);
    if (match && match[1]) {
      const dateStr = match[1];
      const parsed = parseDateString(dateStr);
      if (parsed) {
        console.log(`[ReportDateExtractor] Found report date: ${dateStr} -> ${parsed.toISOString().split('T')[0]}`);
        return parsed;
      }
    }
  }

  const standaloneDatePattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
  const firstHeader = documentContent.slice(0, 2000);
  let dateMatch;
  
  while ((dateMatch = standaloneDatePattern.exec(firstHeader)) !== null) {
    const [, month, day, year] = dateMatch;
    const parsed = parseDateString(`${month}/${day}/${year}`);
    if (parsed) {
      console.log(`[ReportDateExtractor] Found date in header: ${dateMatch[0]} -> ${parsed.toISOString().split('T')[0]}`);
      return parsed;
    }
  }

  return null;
}

function parseDateString(dateStr: string): Date | null {
  try {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;

    let [month, day, year] = parts.map(p => parseInt(p, 10));
    
    if (year < 100) {
      year = year >= 50 ? 1900 + year : 2000 + year;
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
