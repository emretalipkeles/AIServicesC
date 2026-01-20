import type { IPretCommand, GetDimensionDetailsArgs } from '../../../../domain/pret';

export class GetDimensionDetailsCommand implements IPretCommand<GetDimensionDetailsArgs> {
  readonly type = 'getDimensionDetails' as const;

  private constructor(
    public readonly packageId: string,
    public readonly tenantId: string,
    public readonly args: GetDimensionDetailsArgs
  ) {}

  static create(
    packageId: string,
    tenantId: string,
    dimensionName: string,
    modelName?: string
  ): GetDimensionDetailsCommand {
    return new GetDimensionDetailsCommand(packageId, tenantId, { dimensionName, modelName });
  }
}
