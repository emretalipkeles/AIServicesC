export class GetPretPackageQuery {
  constructor(
    public readonly tenantId: string,
    public readonly packageId: string
  ) {}

  static create(tenantId: string, packageId: string): GetPretPackageQuery {
    return new GetPretPackageQuery(tenantId, packageId);
  }
}

export class ListPretPackagesQuery {
  constructor(
    public readonly tenantId: string
  ) {}

  static create(tenantId: string): ListPretPackagesQuery {
    return new ListPretPackagesQuery(tenantId);
  }
}

export class DownloadPackageQuery {
  constructor(
    public readonly tenantId: string,
    public readonly packageId: string
  ) {}

  static create(tenantId: string, packageId: string): DownloadPackageQuery {
    return new DownloadPackageQuery(tenantId, packageId);
  }
}
