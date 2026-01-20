export type PretObjectTypeName =
  | 'Cube'
  | 'AccountDimension'
  | 'TimeDimension'
  | 'VersionDimension'
  | 'CurrencyDimension'
  | 'EntityDimension'
  | 'GenericDimension'
  | 'OtherDimension'
  | 'Measure'
  | 'Report'
  | 'Dashboard'
  | 'Workflow'
  | 'DataIntegration';

export interface ObjectTypeDependency {
  readonly type: PretObjectTypeName;
  readonly required: boolean;
}

export class ObjectType {
  private constructor(
    private readonly _name: PretObjectTypeName,
    private readonly _schemaPath: string,
    private readonly _dependencies: ObjectTypeDependency[]
  ) {}

  static cube(): ObjectType {
    return new ObjectType('Cube', 'cube.schema.yaml', [
      { type: 'AccountDimension', required: true },
      { type: 'TimeDimension', required: true },
      { type: 'VersionDimension', required: false },
      { type: 'CurrencyDimension', required: false },
      { type: 'EntityDimension', required: false },
      { type: 'GenericDimension', required: false },
    ]);
  }

  static accountDimension(): ObjectType {
    return new ObjectType('AccountDimension', 'account-dimension.schema.yaml', []);
  }

  static timeDimension(): ObjectType {
    return new ObjectType('TimeDimension', 'time-dimension.schema.yaml', []);
  }

  static versionDimension(): ObjectType {
    return new ObjectType('VersionDimension', 'version-dimension.schema.yaml', []);
  }

  static currencyDimension(): ObjectType {
    return new ObjectType('CurrencyDimension', 'currency-dimension.schema.yaml', []);
  }

  static entityDimension(): ObjectType {
    return new ObjectType('EntityDimension', 'entity-dimension.schema.yaml', []);
  }

  static genericDimension(): ObjectType {
    return new ObjectType('GenericDimension', 'generic-dimension.schema.yaml', []);
  }

  static otherDimension(): ObjectType {
    return new ObjectType('OtherDimension', 'other-dimension.schema.yaml', []);
  }

  static fromName(name: PretObjectTypeName): ObjectType {
    const factories: Record<PretObjectTypeName, () => ObjectType> = {
      Cube: ObjectType.cube,
      AccountDimension: ObjectType.accountDimension,
      TimeDimension: ObjectType.timeDimension,
      VersionDimension: ObjectType.versionDimension,
      CurrencyDimension: ObjectType.currencyDimension,
      EntityDimension: ObjectType.entityDimension,
      GenericDimension: ObjectType.genericDimension,
      OtherDimension: ObjectType.otherDimension,
      Measure: () => new ObjectType('Measure', 'measure.schema.yaml', [{ type: 'Cube', required: true }]),
      Report: () => new ObjectType('Report', 'report.schema.yaml', [{ type: 'Cube', required: true }]),
      Dashboard: () => new ObjectType('Dashboard', 'dashboard.schema.yaml', []),
      Workflow: () => new ObjectType('Workflow', 'workflow.schema.yaml', []),
      DataIntegration: () => new ObjectType('DataIntegration', 'data-integration.schema.yaml', []),
    };

    return factories[name]();
  }

  get name(): PretObjectTypeName {
    return this._name;
  }

  get schemaPath(): string {
    return this._schemaPath;
  }

  get dependencies(): readonly ObjectTypeDependency[] {
    return this._dependencies;
  }

  hasDependencies(): boolean {
    return this._dependencies.length > 0;
  }

  getRequiredDependencies(): PretObjectTypeName[] {
    return this._dependencies
      .filter(d => d.required)
      .map(d => d.type);
  }

  equals(other: ObjectType): boolean {
    return this._name === other._name;
  }

  toString(): string {
    return this._name;
  }
}
