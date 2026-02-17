import type { IToolRegistry } from '../../../domain/delay-analysis/interfaces/IToolRegistry';
import type { ITool, ToolDefinition } from '../../../domain/delay-analysis/interfaces/ITool';

export class ToolRegistryImpl implements IToolRegistry {
  private readonly tools: Map<string, ITool> = new Map();

  register(tool: ITool): void {
    if (this.tools.has(tool.definition.name)) {
      console.warn(`[ToolRegistry] Overwriting tool: ${tool.definition.name}`);
    }
    this.tools.set(tool.definition.name, tool);
    console.log(`[ToolRegistry] Registered tool: ${tool.definition.name}`);
  }

  getAll(): ITool[] {
    return Array.from(this.tools.values());
  }

  getByName(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  getDefinitions(): ToolDefinition[] {
    return this.getAll().map(t => t.definition);
  }
}
