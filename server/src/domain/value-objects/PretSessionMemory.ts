export interface PretSessionMemoryData {
  packageId: string;
  packageName?: string;
  activeModelName?: string;
  pendingModelSwitch?: string;
  loadedFiles: string[];
  keyPoints: string[];
  lastUpdated: Date;
}

export class PretSessionMemory {
  private readonly data: PretSessionMemoryData;

  constructor(data: PretSessionMemoryData) {
    this.data = {
      ...data,
      loadedFiles: data.loadedFiles || [],
      keyPoints: data.keyPoints || [],
      lastUpdated: data.lastUpdated || new Date(),
    };
  }

  getPackageId(): string {
    return this.data.packageId;
  }

  getPackageName(): string | undefined {
    return this.data.packageName;
  }

  getActiveModelName(): string | undefined {
    return this.data.activeModelName;
  }

  getPendingModelSwitch(): string | undefined {
    return this.data.pendingModelSwitch;
  }

  getLoadedFiles(): string[] {
    return [...this.data.loadedFiles];
  }

  getKeyPoints(): string[] {
    return [...this.data.keyPoints];
  }

  getLastUpdated(): Date {
    return this.data.lastUpdated;
  }

  withActiveModel(modelName: string): PretSessionMemory {
    return new PretSessionMemory({
      ...this.data,
      activeModelName: modelName,
      pendingModelSwitch: undefined,
      lastUpdated: new Date(),
    });
  }

  withPendingModelSwitch(modelName: string): PretSessionMemory {
    return new PretSessionMemory({
      ...this.data,
      pendingModelSwitch: modelName,
      lastUpdated: new Date(),
    });
  }

  clearPendingModelSwitch(): PretSessionMemory {
    return new PretSessionMemory({
      ...this.data,
      pendingModelSwitch: undefined,
      lastUpdated: new Date(),
    });
  }

  withLoadedFile(filePath: string): PretSessionMemory {
    if (this.data.loadedFiles.includes(filePath)) {
      return this;
    }
    return new PretSessionMemory({
      ...this.data,
      loadedFiles: [...this.data.loadedFiles, filePath],
      lastUpdated: new Date(),
    });
  }

  withKeyPoint(keyPoint: string): PretSessionMemory {
    if (this.data.keyPoints.includes(keyPoint)) {
      return this;
    }
    return new PretSessionMemory({
      ...this.data,
      keyPoints: [...this.data.keyPoints, keyPoint],
      lastUpdated: new Date(),
    });
  }

  toContextPrompt(): string {
    const lines: string[] = ['## Session Memory (Preserved Context)'];
    
    if (this.data.packageName) {
      lines.push(`- Active Package: ${this.data.packageName}`);
    }
    
    if (this.data.activeModelName) {
      lines.push(`- Active Model: ${this.data.activeModelName}`);
    }
    
    if (this.data.loadedFiles.length > 0) {
      lines.push(`- Previously Loaded Files:`);
      this.data.loadedFiles.slice(-10).forEach(f => {
        lines.push(`  - ${f}`);
      });
    }
    
    if (this.data.keyPoints.length > 0) {
      lines.push(`- Key Points from Previous Conversation:`);
      this.data.keyPoints.slice(-5).forEach(p => {
        lines.push(`  - ${p}`);
      });
    }
    
    return lines.join('\n');
  }

  toJSON(): PretSessionMemoryData {
    return { ...this.data };
  }

  static fromJSON(json: PretSessionMemoryData): PretSessionMemory {
    return new PretSessionMemory({
      ...json,
      lastUpdated: new Date(json.lastUpdated),
    });
  }
}
