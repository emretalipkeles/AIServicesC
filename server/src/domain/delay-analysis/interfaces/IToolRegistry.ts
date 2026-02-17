import type { ITool, ToolDefinition } from './ITool';

export interface IToolRegistry {
  register(tool: ITool): void;
  getAll(): ITool[];
  getByName(name: string): ITool | undefined;
  getDefinitions(): ToolDefinition[];
}
