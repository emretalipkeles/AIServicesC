import type { PretObjectTypeName } from '../value-objects/ObjectType';
import type { YamlOutput } from '../value-objects/YamlOutput';

export interface CreatedObject {
  readonly objectType: PretObjectTypeName;
  readonly objectName: string;
  readonly yaml: YamlOutput;
  readonly createdAt: Date;
}

export class BuildContext {
  private readonly _objects: Map<string, CreatedObject> = new Map();

  constructor(
    private readonly _tenantId: string,
    private readonly _conversationId: string,
    private readonly _cubeName?: string
  ) {}

  static create(tenantId: string, conversationId: string): BuildContext {
    return new BuildContext(tenantId, conversationId);
  }

  static withCube(tenantId: string, conversationId: string, cubeName: string): BuildContext {
    return new BuildContext(tenantId, conversationId, cubeName);
  }

  get tenantId(): string {
    return this._tenantId;
  }

  get conversationId(): string {
    return this._conversationId;
  }

  get cubeName(): string | undefined {
    return this._cubeName;
  }

  private makeKey(objectType: PretObjectTypeName, objectName: string): string {
    return `${objectType}::${objectName}`;
  }

  addObject(yaml: YamlOutput): void {
    const key = this.makeKey(yaml.objectType, yaml.objectName);
    this._objects.set(key, {
      objectType: yaml.objectType,
      objectName: yaml.objectName,
      yaml,
      createdAt: new Date(),
    });
  }

  getObject(objectType: PretObjectTypeName, objectName: string): CreatedObject | undefined {
    const key = this.makeKey(objectType, objectName);
    return this._objects.get(key);
  }

  hasObject(objectType: PretObjectTypeName, objectName: string): boolean {
    const key = this.makeKey(objectType, objectName);
    return this._objects.has(key);
  }

  getObjectsByType(objectType: PretObjectTypeName): CreatedObject[] {
    return Array.from(this._objects.values())
      .filter(obj => obj.objectType === objectType);
  }

  getAllObjects(): CreatedObject[] {
    return Array.from(this._objects.values());
  }

  getObjectNames(objectType: PretObjectTypeName): string[] {
    return this.getObjectsByType(objectType).map(obj => obj.objectName);
  }

  hasDimensions(): boolean {
    const dimensionTypes: PretObjectTypeName[] = [
      'AccountDimension',
      'TimeDimension',
      'VersionDimension',
      'CurrencyDimension',
      'EntityDimension',
      'GenericDimension',
    ];
    return dimensionTypes.some(type => this.getObjectsByType(type).length > 0);
  }

  getDimensionSummary(): string {
    const dimensionTypes: PretObjectTypeName[] = [
      'AccountDimension',
      'TimeDimension',
      'VersionDimension',
      'CurrencyDimension',
      'EntityDimension',
      'GenericDimension',
    ];

    const summary: string[] = [];
    for (const type of dimensionTypes) {
      const objects = this.getObjectsByType(type);
      if (objects.length > 0) {
        summary.push(`- ${type}: ${objects.map(o => o.objectName).join(', ')}`);
      }
    }

    return summary.length > 0 
      ? `**Created Dimensions:**\n${summary.join('\n')}`
      : 'No dimensions created yet.';
  }

  toContextString(): string {
    if (this._objects.size === 0) {
      return 'No objects have been created yet in this session.';
    }

    let context = '## Build Context\n\n';
    context += `Tenant: ${this._tenantId}\n`;
    context += `Conversation: ${this._conversationId}\n`;
    if (this._cubeName) {
      context += `Target Cube: ${this._cubeName}\n`;
    }
    context += '\n';
    context += this.getDimensionSummary();

    return context;
  }

  isEmpty(): boolean {
    return this._objects.size === 0;
  }

  objectCount(): number {
    return this._objects.size;
  }
}
