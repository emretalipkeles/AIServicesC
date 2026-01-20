import { z } from 'zod';
import { feedback, insertFeedbackSchema } from '@shared/schema';
import type { PgTable } from 'drizzle-orm/pg-core';

export interface TableSchema {
  table: PgTable;
  insertSchema: z.ZodSchema;
  columns: string[];
}

const REGISTERED_TABLES: Record<string, TableSchema> = {
  feedback: {
    table: feedback,
    insertSchema: insertFeedbackSchema,
    columns: ['userEmail', 'userName', 'category', 'sentiment', 'summary', 'conversation', 'currentPage'],
  },
};

export class SchemaRegistry {
  static getTableSchema(tableName: string): TableSchema | null {
    return REGISTERED_TABLES[tableName] ?? null;
  }

  static isTableRegistered(tableName: string): boolean {
    return tableName in REGISTERED_TABLES;
  }

  static getRegisteredTableNames(): string[] {
    return Object.keys(REGISTERED_TABLES);
  }

  static validateData(tableName: string, data: Record<string, unknown>): { 
    success: boolean; 
    data?: Record<string, unknown>; 
    error?: string 
  } {
    const schema = this.getTableSchema(tableName);
    if (!schema) {
      return { success: false, error: `Table '${tableName}' is not registered` };
    }

    const result = schema.insertSchema.safeParse(data);
    if (!result.success) {
      return { 
        success: false, 
        error: `Validation failed: ${result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}` 
      };
    }

    return { success: true, data: result.data };
  }

  static getColumnNames(tableName: string): string[] | null {
    const schema = this.getTableSchema(tableName);
    return schema?.columns ?? null;
  }
}
