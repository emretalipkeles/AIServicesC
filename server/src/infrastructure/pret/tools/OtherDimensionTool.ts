import { BasePretTool } from './BasePretTool';
import { ObjectType } from '../../../domain/pret/value-objects/ObjectType';
import type { IAIClient } from '../../../domain/interfaces/IAIClient';
import type { IPretValidator } from '../../../domain/pret/interfaces/IPretValidator';

export class OtherDimensionTool extends BasePretTool {
  constructor(schemaContent: string, aiClient: IAIClient, validator: IPretValidator) {
    super(ObjectType.otherDimension(), schemaContent, aiClient, validator);
  }

  getPromptTemplate(): string {
    return `Help the user create an Other Dimension (generic custom dimension) for their Prophix FP&A Plus model.

## Other Dimension Overview
An Other Dimension is a generic dimension for custom business hierarchies that don't fit into Account, Time, Version, Currency, or Entity categories. Common examples include:
- Product dimensions
- Customer dimensions
- Region/Geography dimensions
- Department dimensions
- Project dimensions
- Cost Center dimensions
- Custom categorizations

## Key Questions to Ask
1. What is the name of this dimension? (e.g., Product, Customer, Region)
2. What members do you need? (e.g., specific products, customers, regions)
3. How should members be organized? (flat list or parent-child hierarchy)
4. Do you need any custom properties on members? (e.g., Product Type, Customer Tier)
5. Is there a root/total member that aggregates all others?

## Generation Guidelines
- Use meaningful keys (alphanumeric, no spaces)
- Create clear parent-child relationships using the 'parent' field
- Add a root member if hierarchical aggregation is needed
- Define custom properties only if explicitly requested
- Keep the structure simple unless complexity is requested

## YAML Structure
\`\`\`yaml
apiVersion: model.fpna.prophix.com/v1
kind: OtherDimension
metadata:
  name: DimensionName
spec:
  name: DimensionName
  members:
    - key: ROOT
      name: Total
    - key: MEMBER1
      name: Member 1
      parent: ROOT
\`\`\`

Generate valid YAML conforming to the OtherDimension schema.`;
  }
}
