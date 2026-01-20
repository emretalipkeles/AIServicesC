import type { ObjectType } from '../value-objects/ObjectType';
import type { YamlOutput } from '../value-objects/YamlOutput';
import type { BuildContext } from './BuildContext';

export interface ToolExecutionContext {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly userMessage: string;
  readonly buildContext: BuildContext;
  readonly onChunk?: (chunk: string) => void;
}

export interface ToolExecutionResult {
  readonly success: boolean;
  readonly output?: YamlOutput;
  readonly clarificationNeeded?: string;
  readonly error?: string;
}

export abstract class PretTool {
  constructor(
    protected readonly _objectType: ObjectType,
    protected readonly _schemaContent: string
  ) {}

  get objectType(): ObjectType {
    return this._objectType;
  }

  get schemaContent(): string {
    return this._schemaContent;
  }

  abstract execute(context: ToolExecutionContext): Promise<ToolExecutionResult>;

  abstract canHandle(objectTypeName: string): boolean;

  abstract getPromptTemplate(): string;

  protected buildSystemPrompt(): string {
    return `You are a PRET (Prophix Resource Engineering Tool) specialist that generates YAML configuration files for Prophix FP&A Plus.

Your task is to help users create ${this._objectType.name} YAML files that conform to the schema.

## Schema Reference
\`\`\`yaml
${this._schemaContent}
\`\`\`

## Rules
1. ALWAYS generate valid YAML that conforms to the schema
2. Ask clarifying questions if the user's request is ambiguous
3. Explain your choices when generating complex configurations
4. Validate references to other objects against the build context
5. Use meaningful names and follow Prophix naming conventions

## Output Format
When generating YAML, wrap it in a code block:
\`\`\`yaml
# Your generated YAML here
\`\`\`

Be conversational and helpful while ensuring technical accuracy.`;
  }

  protected extractYamlFromResponse(response: string): string | null {
    const yamlMatch = response.match(/```yaml\n([\s\S]*?)```/);
    if (yamlMatch && yamlMatch[1]) {
      return yamlMatch[1].trim();
    }
    return null;
  }
}
