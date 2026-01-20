import type { IPretCommand, CreateOtherDimensionArgs } from '../../../../domain/pret';

export type DimensionKind = 'OtherDimension' | 'AccountDimension' | 'TimeDimension';

export class CreateOtherDimensionCommand implements IPretCommand<CreateOtherDimensionArgs> {
  readonly type = 'createOtherDimension' as const;

  private constructor(
    public readonly packageId: string,
    public readonly tenantId: string,
    public readonly args: CreateOtherDimensionArgs
  ) {}

  static create(
    packageId: string,
    tenantId: string,
    modelName: string,
    dimensionName: string,
    dimensionKind: DimensionKind = 'OtherDimension',
    dimensionDescription?: string
  ): CreateOtherDimensionCommand {
    return new CreateOtherDimensionCommand(packageId, tenantId, {
      modelName,
      dimensionName,
      dimensionKind,
      dimensionDescription
    });
  }
}
