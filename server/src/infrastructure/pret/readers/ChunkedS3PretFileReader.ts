import type { 
  IPretFileReader, 
  FileChunk, 
  FileReadResult, 
  FileReadOptions,
  IPretPackageStorage 
} from '../../../domain/pret';
import * as yaml from 'js-yaml';

const DEFAULT_CHUNK_SIZE = 32 * 1024;
const DEFAULT_MAX_FULL_CONTENT = 100 * 1024;
const LARGE_FILE_THRESHOLD = 100 * 1024;

export class ChunkedS3PretFileReader implements IPretFileReader {
  constructor(private readonly storage: IPretPackageStorage) {}

  async readFile(
    tenantId: string,
    packageId: string,
    filePath: string,
    options?: FileReadOptions
  ): Promise<FileReadResult> {
    try {
      const rawContent = await this.storage.getFileContent(tenantId, packageId, filePath);
      
      if (!rawContent) {
        return {
          success: false,
          error: `File not found: ${filePath}`,
          isLargeFile: false,
          totalBytes: 0,
        };
      }

      const content = typeof rawContent === 'string' ? rawContent : rawContent.toString('utf-8');
      const totalBytes = Buffer.byteLength(content, 'utf-8');
      const maxFullContent = options?.maxFullContentBytes || DEFAULT_MAX_FULL_CONTENT;
      const isLargeFile = totalBytes > LARGE_FILE_THRESHOLD;

      const analysis = this.analyzeYamlContent(content);

      if (isLargeFile) {
        const summary = this.buildLargeFileSummary(content, analysis);
        return {
          success: true,
          summary,
          memberCount: analysis.memberCount,
          hasCalculations: analysis.hasCalculations,
          isLargeFile: true,
          totalBytes,
        };
      }

      return {
        success: true,
        fullContent: content,
        summary: this.buildSummary(content, analysis),
        memberCount: analysis.memberCount,
        hasCalculations: analysis.hasCalculations,
        isLargeFile: false,
        totalBytes,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error reading file',
        isLargeFile: false,
        totalBytes: 0,
      };
    }
  }

  async readFileChunked(
    tenantId: string,
    packageId: string,
    filePath: string,
    onChunk: (chunk: FileChunk) => void,
    options?: FileReadOptions
  ): Promise<FileReadResult> {
    try {
      const rawContent = await this.storage.getFileContent(tenantId, packageId, filePath);
      
      if (!rawContent) {
        return {
          success: false,
          error: `File not found: ${filePath}`,
          isLargeFile: false,
          totalBytes: 0,
        };
      }

      const content = typeof rawContent === 'string' ? rawContent : rawContent.toString('utf-8');
      const totalBytes = Buffer.byteLength(content, 'utf-8');
      const chunkSize = options?.chunkSizeBytes || DEFAULT_CHUNK_SIZE;
      const chunks: string[] = [];

      for (let i = 0; i < content.length; i += chunkSize) {
        const chunkContent = content.slice(i, i + chunkSize);
        chunks.push(chunkContent);
        
        const chunk: FileChunk = {
          content: chunkContent,
          chunkIndex: Math.floor(i / chunkSize),
          isLast: i + chunkSize >= content.length,
          bytesRead: Math.min(chunkSize, content.length - i),
          totalBytes,
        };
        
        onChunk(chunk);
      }

      const fullContent = chunks.join('');
      const analysis = this.analyzeYamlContent(fullContent);
      const isLargeFile = totalBytes > LARGE_FILE_THRESHOLD;

      return {
        success: true,
        fullContent: isLargeFile ? undefined : fullContent,
        summary: isLargeFile 
          ? this.buildLargeFileSummary(fullContent, analysis)
          : this.buildSummary(fullContent, analysis),
        memberCount: analysis.memberCount,
        hasCalculations: analysis.hasCalculations,
        isLargeFile,
        totalBytes,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error reading file',
        isLargeFile: false,
        totalBytes: 0,
      };
    }
  }

  async getFileSize(
    tenantId: string,
    packageId: string,
    filePath: string
  ): Promise<number | null> {
    try {
      const rawContent = await this.storage.getFileContent(tenantId, packageId, filePath);
      if (!rawContent) return null;
      const content = typeof rawContent === 'string' ? rawContent : rawContent.toString('utf-8');
      return Buffer.byteLength(content, 'utf-8');
    } catch {
      return null;
    }
  }

  private analyzeYamlContent(content: string): {
    memberCount: number;
    hasCalculations: boolean;
    kind: string;
    name: string;
    firstMembers: any[];
    rootMembers: string[];
  } {
    try {
      const parsed = yaml.load(content) as any;
      
      const kind = parsed?.kind || 'Unknown';
      const name = parsed?.metadata?.name || parsed?.spec?.name || 'Unknown';
      const members = parsed?.spec?.members || [];
      const memberCount = Array.isArray(members) ? members.length : 0;
      
      const hasCalculations = members.some((m: any) => 
        m.calculations && Array.isArray(m.calculations) && m.calculations.length > 0
      );

      const firstMembers = members.slice(0, 20);
      
      const rootMembers = members
        .filter((m: any) => !m.parent)
        .slice(0, 10)
        .map((m: any) => m.name || m.key);

      return {
        memberCount,
        hasCalculations,
        kind,
        name,
        firstMembers,
        rootMembers,
      };
    } catch {
      const memberMatches = content.match(/^\s*-\s*key:/gm);
      const memberCount = memberMatches ? memberMatches.length : 0;
      const hasCalculations = content.includes('calculations:');
      
      return {
        memberCount,
        hasCalculations,
        kind: 'Unknown',
        name: 'Unknown',
        firstMembers: [],
        rootMembers: [],
      };
    }
  }

  private buildSummary(content: string, analysis: ReturnType<typeof this.analyzeYamlContent>): string {
    const lines: string[] = [];
    lines.push(`**${analysis.kind}: ${analysis.name}**`);
    lines.push(`- Total members: ${analysis.memberCount}`);
    lines.push(`- Has calculations: ${analysis.hasCalculations ? 'Yes' : 'No'}`);
    
    if (analysis.rootMembers.length > 0) {
      lines.push(`- Root members: ${analysis.rootMembers.join(', ')}`);
    }
    
    return lines.join('\n');
  }

  private buildLargeFileSummary(
    content: string, 
    analysis: ReturnType<typeof this.analyzeYamlContent>
  ): string {
    const lines: string[] = [];
    lines.push(`**${analysis.kind}: ${analysis.name}** (Large file - ${analysis.memberCount} members)`);
    lines.push('');
    lines.push('### Structure Overview');
    lines.push(`- Total members: ${analysis.memberCount}`);
    lines.push(`- Has calculations: ${analysis.hasCalculations ? 'Yes' : 'No'}`);
    
    if (analysis.rootMembers.length > 0) {
      lines.push(`- Top-level members: ${analysis.rootMembers.join(', ')}`);
    }
    
    lines.push('');
    lines.push('### Sample Members (first 20):');
    lines.push('```yaml');
    
    if (analysis.firstMembers.length > 0) {
      const sampleYaml = yaml.dump({ members: analysis.firstMembers }, { 
        indent: 2, 
        lineWidth: 120,
        noRefs: true 
      });
      lines.push(sampleYaml);
    } else {
      const yamlLines = content.split('\n');
      const sampleLines = yamlLines.slice(0, 100).join('\n');
      lines.push(sampleLines);
      if (yamlLines.length > 100) {
        lines.push('# ... [truncated - showing first 100 lines]');
      }
    }
    
    lines.push('```');
    
    return lines.join('\n');
  }
}
