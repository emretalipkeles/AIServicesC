import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { ISchemaValidator, SchemaValidationResult } from '../../../domain/pret/interfaces/IPretValidator';
import type { ValidationError } from '../../../domain/pret/value-objects/YamlOutput';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SchemaValidator implements ISchemaValidator {
  private readonly schemasDir: string;
  private readonly schemaCache: Map<string, string> = new Map();

  constructor(schemasDir?: string) {
    this.schemasDir = schemasDir || path.join(__dirname, '../schemas/Model');
  }

  async validateSchema(yamlContent: string, schemaPath: string): Promise<SchemaValidationResult> {
    const errors: ValidationError[] = [];

    try {
      const lines = yamlContent.split('\n');
      
      if (!yamlContent.includes('apiVersion:')) {
        errors.push({
          path: 'apiVersion',
          message: 'Missing required field: apiVersion',
          severity: 'error',
        });
      }

      if (!yamlContent.includes('kind:')) {
        errors.push({
          path: 'kind',
          message: 'Missing required field: kind',
          severity: 'error',
        });
      }

      if (!yamlContent.includes('metadata:')) {
        errors.push({
          path: 'metadata',
          message: 'Missing required field: metadata',
          severity: 'error',
        });
      }

      if (!yamlContent.includes('spec:')) {
        errors.push({
          path: 'spec',
          message: 'Missing required field: spec',
          severity: 'error',
        });
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('\t')) {
          errors.push({
            path: `line ${i + 1}`,
            message: 'YAML should use spaces, not tabs for indentation',
            severity: 'warning',
          });
        }
      }

      return {
        isValid: errors.filter(e => e.severity === 'error').length === 0,
        errors,
      };
    } catch (error) {
      errors.push({
        path: 'root',
        message: `YAML parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error',
      });

      return {
        isValid: false,
        errors,
      };
    }
  }

  async getSchema(schemaPath: string): Promise<string | null> {
    if (this.schemaCache.has(schemaPath)) {
      return this.schemaCache.get(schemaPath)!;
    }

    try {
      const fullPath = path.join(this.schemasDir, schemaPath);
      const content = await fs.promises.readFile(fullPath, 'utf-8');
      this.schemaCache.set(schemaPath, content);
      return content;
    } catch (error) {
      console.error(`Failed to load schema ${schemaPath}:`, error);
      return null;
    }
  }
}
