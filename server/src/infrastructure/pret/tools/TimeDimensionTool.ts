import { BasePretTool } from './BasePretTool';
import { ObjectType } from '../../../domain/pret/value-objects/ObjectType';
import type { IAIClient } from '../../../domain/interfaces/IAIClient';
import type { IPretValidator } from '../../../domain/pret/interfaces/IPretValidator';

export class TimeDimensionTool extends BasePretTool {
  constructor(schemaContent: string, aiClient: IAIClient, validator: IPretValidator) {
    super(ObjectType.timeDimension(), schemaContent, aiClient, validator);
  }

  getPromptTemplate(): string {
    return `Help the user create a Time Dimension for their Prophix FP&A Plus model.

## Time Dimension Overview
A Time Dimension defines the time periods for your model including:
- Fiscal year structure
- Period types (Monthly, Quarterly, Annual)
- Year range (start and end years)
- Calendar vs Fiscal year settings

## Key Questions to Ask
1. What is the name of this Time Dimension?
2. What is your fiscal year start month? (January = calendar year)
3. What year range do you need? (e.g., 2020-2030)
4. Do you need monthly, quarterly, or both granularities?
5. Any special period naming conventions?

## Generation Guidelines
- Create a logical hierarchy (Year > Quarter > Month)
- Use standard period naming (Jan, Feb, Q1, FY2024, etc.)
- Include rollup periods appropriately
- Set fiscal year offset if not calendar year

Generate valid YAML conforming to the TimeDimension schema.`;
  }
}
