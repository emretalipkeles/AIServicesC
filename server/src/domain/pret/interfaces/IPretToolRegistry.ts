import type { PretTool } from '../entities/PretTool';
import type { PretObjectTypeName } from '../value-objects/ObjectType';

export interface IPretToolRegistry {
  getTool(objectType: PretObjectTypeName): PretTool | null;
  
  getAllTools(): PretTool[];
  
  getSupportedObjectTypes(): PretObjectTypeName[];
  
  hasTool(objectType: PretObjectTypeName): boolean;
  
  registerTool(tool: PretTool): void;
}
