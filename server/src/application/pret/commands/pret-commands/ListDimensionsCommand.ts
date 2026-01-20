import type { IPretCommand, ListDimensionsArgs } from '../../../../domain/pret';

export class ListDimensionsCommand implements IPretCommand<ListDimensionsArgs> {
  readonly type = 'listDimensions' as const;

  private constructor(
    public readonly packageId: string,
    public readonly tenantId: string,
    public readonly args: ListDimensionsArgs
  ) {}

  static create(
    packageId: string,
    tenantId: string,
    modelName?: string,
    dimensionType?: string
  ): ListDimensionsCommand {
    return new ListDimensionsCommand(packageId, tenantId, { modelName, dimensionType });
  }
}
