import type { PretObjectTypeName } from './ObjectType';

export interface FileContextProps {
  readonly conversationId: string;
  readonly tenantId: string;
  readonly packageId: string;
  readonly filePath: string;
  readonly objectType: PretObjectTypeName;
  readonly objectName: string;
  readonly modelName?: string;
  readonly fullContent?: string;
  readonly summary: string;
  readonly memberCount: number;
  readonly hasCalculations: boolean;
  readonly isLargeFile: boolean;
  readonly totalBytes: number;
  readonly loadedAt: Date;
}

export class FileContext {
  private constructor(private readonly props: FileContextProps) {}

  static create(props: FileContextProps): FileContext {
    if (!props.conversationId) {
      throw new Error('FileContext requires conversationId');
    }
    if (!props.filePath) {
      throw new Error('FileContext requires filePath');
    }
    if (!props.summary) {
      throw new Error('FileContext requires summary');
    }
    return new FileContext(props);
  }

  get conversationId(): string {
    return this.props.conversationId;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get packageId(): string {
    return this.props.packageId;
  }

  get filePath(): string {
    return this.props.filePath;
  }

  get objectType(): PretObjectTypeName {
    return this.props.objectType;
  }

  get objectName(): string {
    return this.props.objectName;
  }

  get modelName(): string | undefined {
    return this.props.modelName;
  }

  get fullContent(): string | undefined {
    return this.props.fullContent;
  }

  get summary(): string {
    return this.props.summary;
  }

  get memberCount(): number {
    return this.props.memberCount;
  }

  get hasCalculations(): boolean {
    return this.props.hasCalculations;
  }

  get isLargeFile(): boolean {
    return this.props.isLargeFile;
  }

  get totalBytes(): number {
    return this.props.totalBytes;
  }

  get loadedAt(): Date {
    return this.props.loadedAt;
  }

  hasFullContent(): boolean {
    return this.props.fullContent !== undefined;
  }

  getContentForPrompt(): string {
    if (this.props.fullContent) {
      return this.props.fullContent;
    }
    return this.props.summary;
  }

  toContextString(): string {
    let context = `## File: ${this.props.objectName} (${this.props.objectType})\n`;
    context += `Path: ${this.props.filePath}\n`;
    if (this.props.modelName) {
      context += `Model: ${this.props.modelName}\n`;
    }
    context += `Members: ${this.props.memberCount}\n`;
    context += `Has Calculations: ${this.props.hasCalculations ? 'Yes' : 'No'}\n`;
    context += `Size: ${this.formatBytes(this.props.totalBytes)}\n`;
    context += `\n### Content:\n${this.getContentForPrompt()}\n`;
    return context;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  toJSON(): FileContextProps {
    return { ...this.props };
  }
}
