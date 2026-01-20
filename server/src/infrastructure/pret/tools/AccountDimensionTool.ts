import { BasePretTool } from './BasePretTool';
import { ObjectType } from '../../../domain/pret/value-objects/ObjectType';
import type { IAIClient } from '../../../domain/interfaces/IAIClient';
import type { IPretValidator } from '../../../domain/pret/interfaces/IPretValidator';

export class AccountDimensionTool extends BasePretTool {
  constructor(schemaContent: string, aiClient: IAIClient, validator: IPretValidator) {
    super(ObjectType.accountDimension(), schemaContent, aiClient, validator);
  }

  getPromptTemplate(): string {
    return `Help the user create an Account Dimension for their Prophix FP&A Plus model.

## Account Dimension Overview
An Account Dimension defines the chart of accounts structure including:
- Account hierarchy (parent-child relationships)
- Account types (Expense, Revenue, Asset, Liability, Statistical)
- Calculation methods and formulas
- Time conversion settings
- Rollup operators (+, -, ~)

## Key Questions to Ask
1. What is the name of this Account Dimension?
2. What accounts do you need? (e.g., Revenue, Cost of Sales, Operating Expenses)
3. How should accounts roll up? (parent hierarchy)
4. Are there any calculated accounts with formulas?
5. What account types apply to each account?

## Generation Guidelines
- Start with a root "Total" or summary account
- Create logical groupings (Revenue accounts, Expense accounts, etc.)
- Use meaningful keys (no spaces, follow naming conventions)
- Set appropriate rollup operators (+ for normal, - for contra accounts)
- Include common accounts unless told otherwise

Generate valid YAML conforming to the AccountDimension schema.`;
  }
}
