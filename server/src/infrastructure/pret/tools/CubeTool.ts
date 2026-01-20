import { BasePretTool } from './BasePretTool';
import { ObjectType } from '../../../domain/pret/value-objects/ObjectType';
import type { IAIClient } from '../../../domain/interfaces/IAIClient';
import type { IPretValidator } from '../../../domain/pret/interfaces/IPretValidator';
import type { ToolExecutionContext } from '../../../domain/pret/entities/PretTool';

export class CubeTool extends BasePretTool {
  constructor(schemaContent: string, aiClient: IAIClient, validator: IPretValidator) {
    super(ObjectType.cube(), schemaContent, aiClient, validator);
  }


  getPromptTemplate(): string {
    return `Help the user create a Cube (model) for their Prophix FP&A Plus implementation.

## Cube Overview
A Cube is the central data container that brings together:
- Dimensions (Account, Time, Version, Entity, Currency, custom dimensions)
- Data storage configuration
- Model settings and entitlements

## Key Questions to Ask
1. What is the name of this Cube/Model?
2. What is the purpose? (Budgeting, Forecasting, Reporting, etc.)
3. Which dimensions should be included?
4. Should it include Currency dimension?
5. Should it include Detailed Planning features?

## Generation Guidelines
- Reference only dimensions that exist in the build context
- Use appropriate cube type
- Set entitlement and category appropriately
- Include standard dimensions first, then optional ones

Generate valid YAML conforming to the Cube schema.`;
  }

  protected buildUserPrompt(context: ToolExecutionContext): string {
    let prompt = context.userMessage;

    prompt += `\n\n## Available Dimensions\n${context.buildContext.getDimensionSummary()}`;
    
    prompt += `\n\n**Important**: Only reference dimensions that are listed above. Do not invent dimension names.`;

    return prompt;
  }
}
