import type { IPretCommand, GetCubeDetailsArgs } from '../../../../domain/pret';

export class GetCubeDetailsCommand implements IPretCommand<GetCubeDetailsArgs> {
  readonly type = 'getCubeDetails' as const;

  private constructor(
    public readonly packageId: string,
    public readonly tenantId: string,
    public readonly args: GetCubeDetailsArgs
  ) {}

  static create(
    packageId: string,
    tenantId: string,
    cubeName: string
  ): GetCubeDetailsCommand {
    return new GetCubeDetailsCommand(packageId, tenantId, { cubeName });
  }
}
