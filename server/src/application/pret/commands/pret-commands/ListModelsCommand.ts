import type { IPretCommand, ListModelsArgs } from '../../../../domain/pret';

export class ListModelsCommand implements IPretCommand<ListModelsArgs> {
  readonly type = 'listModels' as const;

  private constructor(
    public readonly packageId: string,
    public readonly tenantId: string,
    public readonly args: ListModelsArgs
  ) {}

  static create(
    packageId: string,
    tenantId: string,
    includeDetails = false
  ): ListModelsCommand {
    return new ListModelsCommand(packageId, tenantId, { includeDetails });
  }
}
