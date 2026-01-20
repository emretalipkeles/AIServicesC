export class GetDimensionMembersQuery {
  constructor(
    public readonly tenantId: string,
    public readonly packageId: string,
    public readonly dimensionPath: string
  ) {}
}
