export interface ParsedStructuredBlock {
  tableName: string;
  data: Record<string, unknown>;
  rawText: string;
  startIndex: number;
  endIndex: number;
}

export function parseStructuredBlocks(content: string): ParsedStructuredBlock[] {
  const blocks: ParsedStructuredBlock[] = [];
  const regex = /\[(\w+)\]([\s\S]*?)\[\/\1\]/g;
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    const tableName = match[1];
    const rawText = match[0];
    const blockContent = match[2].trim();
    
    const data: Record<string, unknown> = {};
    const lines = blockContent.split('\n');
    
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const rawValue = line.slice(colonIndex + 1).trim();
        if (key) {
          const camelKey = camelCase(key);
          data[camelKey] = parseValue(rawValue);
        }
      }
    }
    
    blocks.push({
      tableName,
      data,
      rawText,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }
  
  return blocks;
}

function parseValue(value: string): unknown {
  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') {
    return num;
  }
  
  return value;
}

export function removeStructuredBlocks(content: string): string {
  return content.replace(/\[(\w+)\][\s\S]*?\[\/\1\]/g, '').trim();
}

export function hasStructuredBlocks(content: string): boolean {
  return /\[\w+\][\s\S]*?\[\/\w+\]/.test(content);
}

function camelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase());
}

export function formatBlockForDisplay(block: ParsedStructuredBlock): string {
  const entries = Object.entries(block.data);
  return entries.map(([key, value]) => `${formatLabel(key)}: ${value}`).join('\n');
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}
