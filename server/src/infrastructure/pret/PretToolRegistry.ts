import type { IPretToolRegistry } from '../../domain/pret/interfaces/IPretToolRegistry';
import type { PretTool } from '../../domain/pret/entities/PretTool';
import type { PretObjectTypeName } from '../../domain/pret/value-objects/ObjectType';
import type { IAIClient } from '../../domain/interfaces/IAIClient';
import type { IPretValidator } from '../../domain/pret/interfaces/IPretValidator';
import { AccountDimensionTool } from './tools/AccountDimensionTool';
import { CubeTool } from './tools/CubeTool';
import { TimeDimensionTool } from './tools/TimeDimensionTool';
import { OtherDimensionTool } from './tools/OtherDimensionTool';
import { PretValidator } from './validators/PretValidator';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PretToolRegistry implements IPretToolRegistry {
  private readonly tools: Map<PretObjectTypeName, PretTool> = new Map();
  private readonly modelSchemasDir: string;
  private readonly dimensionSchemasDir: string;

  constructor(
    private readonly aiClient: IAIClient,
    private readonly validator?: IPretValidator,
    schemasDir?: string
  ) {
    const baseDir = schemasDir || path.join(__dirname, 'schemas');
    this.modelSchemasDir = path.join(baseDir, 'Model');
    this.dimensionSchemasDir = path.join(baseDir, 'Dimensions');
    this.initializeTools();
  }

  private initializeTools(): void {
    const pretValidator = this.validator || new PretValidator(this.modelSchemasDir);

    const accountDimensionSchema = this.loadSchema('account-dimension.schema.yaml', this.dimensionSchemasDir);
    if (accountDimensionSchema) {
      this.tools.set('AccountDimension', 
        new AccountDimensionTool(accountDimensionSchema, this.aiClient, pretValidator)
      );
    }

    const cubeSchema = this.loadSchema('cube.schema.yaml', this.modelSchemasDir);
    if (cubeSchema) {
      this.tools.set('Cube', 
        new CubeTool(cubeSchema, this.aiClient, pretValidator)
      );
    }

    const timeDimensionSchema = this.loadSchema('time-dimension.schema.yaml', this.dimensionSchemasDir);
    if (timeDimensionSchema) {
      this.tools.set('TimeDimension',
        new TimeDimensionTool(timeDimensionSchema, this.aiClient, pretValidator)
      );
    }

    const otherDimensionSchema = this.loadSchema('other-dimension.schema.yaml', this.dimensionSchemasDir);
    if (otherDimensionSchema) {
      this.tools.set('OtherDimension',
        new OtherDimensionTool(otherDimensionSchema, this.aiClient, pretValidator)
      );
    }
  }

  private loadSchema(filename: string, schemaDir: string): string | null {
    try {
      const schemaPath = path.join(schemaDir, filename);
      return fs.readFileSync(schemaPath, 'utf-8');
    } catch (error) {
      console.warn(`Could not load schema ${filename}:`, error);
      return null;
    }
  }

  getTool(objectType: PretObjectTypeName): PretTool | null {
    return this.tools.get(objectType) || null;
  }

  getAllTools(): PretTool[] {
    return Array.from(this.tools.values());
  }

  getSupportedObjectTypes(): PretObjectTypeName[] {
    return Array.from(this.tools.keys());
  }

  hasTool(objectType: PretObjectTypeName): boolean {
    return this.tools.has(objectType);
  }

  registerTool(tool: PretTool): void {
    this.tools.set(tool.objectType.name, tool);
  }
}
