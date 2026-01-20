export interface StructuredOutputEntry {
  tableName: string;
  data: Record<string, unknown>;
}

export interface IStructuredOutputRepository {
  save(tableName: string, data: Record<string, unknown>): Promise<string>;
  saveMultiple(entries: StructuredOutputEntry[]): Promise<string[]>;
}
