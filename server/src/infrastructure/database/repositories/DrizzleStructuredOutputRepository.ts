import type { IStructuredOutputRepository, StructuredOutputEntry } from '../../../domain/repositories/IStructuredOutputRepository';
import { SchemaRegistry, TableSchema } from '../../persistence/SchemaRegistry';
import { db } from '../../database';

export class DrizzleStructuredOutputRepository implements IStructuredOutputRepository {
  async save(tableName: string, data: Record<string, unknown>): Promise<string> {
    const schema = SchemaRegistry.getTableSchema(tableName);
    if (!schema) {
      throw new Error(`Table '${tableName}' is not registered in schema registry`);
    }

    const validation = SchemaRegistry.validateData(tableName, data);
    if (!validation.success) {
      throw new Error(validation.error);
    }

    const result = await db.insert(schema.table).values(validation.data as any).returning({ id: (schema.table as any).id });
    return result[0]?.id ?? '';
  }

  async saveMultiple(entries: StructuredOutputEntry[]): Promise<string[]> {
    const ids: string[] = [];
    const validatedEntries: { schema: TableSchema; data: Record<string, unknown> }[] = [];
    
    for (const entry of entries) {
      const schema = SchemaRegistry.getTableSchema(entry.tableName);
      if (!schema) {
        throw new Error(`Table '${entry.tableName}' is not registered in schema registry`);
      }

      const validation = SchemaRegistry.validateData(entry.tableName, entry.data);
      if (!validation.success || !validation.data) {
        throw new Error(`Validation failed for ${entry.tableName}: ${validation.error}`);
      }
      
      validatedEntries.push({ schema, data: validation.data });
    }

    await db.transaction(async (tx) => {
      for (const validatedEntry of validatedEntries) {
        const result = await tx.insert(validatedEntry.schema.table).values(validatedEntry.data as any).returning({ id: (validatedEntry.schema.table as any).id });
        ids.push(result[0]?.id ?? '');
      }
    });

    return ids;
  }
}
