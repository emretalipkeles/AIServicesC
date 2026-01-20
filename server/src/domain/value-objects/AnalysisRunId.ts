export class AnalysisRunId {
  private constructor(public readonly value: string) {}

  static create(): AnalysisRunId {
    return new AnalysisRunId(crypto.randomUUID());
  }

  static fromString(id: string): AnalysisRunId {
    if (!id || id.trim().length === 0) {
      throw new Error('AnalysisRunId cannot be empty');
    }
    return new AnalysisRunId(id);
  }

  equals(other: AnalysisRunId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
