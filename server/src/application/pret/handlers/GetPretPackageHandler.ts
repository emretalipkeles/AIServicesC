import type { GetPretPackageQuery, ListPretPackagesQuery, DownloadPackageQuery } from '../queries/GetPretPackageQuery';
import type { IPretPackageSessionRepository } from '../../../domain/pret/interfaces/IPretPackageSessionRepository';
import type { IPretPackageStorage } from '../../../domain/pret/interfaces/IPretPackageStorage';
import type { PretPackageDto, PackageContentsDto } from '../dto/PretPackageDto';
import { PretPackageSession } from '../../../domain/pret/entities/PretPackageSession';

export class GetPretPackageHandler {
  constructor(
    private readonly sessionRepository: IPretPackageSessionRepository,
    private readonly storage: IPretPackageStorage
  ) {}

  async handle(query: GetPretPackageQuery): Promise<PretPackageDto | null> {
    const session = await this.sessionRepository.findByPackageId(
      query.packageId,
      query.tenantId
    );

    if (!session) {
      return null;
    }

    return this.toDto(session);
  }

  async handleList(query: ListPretPackagesQuery): Promise<PretPackageDto[]> {
    const sessions = await this.sessionRepository.findAllByTenant(query.tenantId);
    return sessions.map(s => this.toDto(s));
  }

  async getPackageContents(query: GetPretPackageQuery): Promise<PackageContentsDto | null> {
    const session = await this.sessionRepository.findByPackageId(
      query.packageId,
      query.tenantId
    );

    if (!session || !session.isReady()) {
      return null;
    }

    const files = await this.storage.getPackageContents(
      query.tenantId,
      query.packageId
    );

    return {
      packageId: query.packageId,
      files,
    };
  }

  async downloadPackage(query: DownloadPackageQuery): Promise<{ buffer: Buffer; packageName: string } | null> {
    const session = await this.sessionRepository.findByPackageId(
      query.packageId,
      query.tenantId
    );

    if (!session || !session.isReady()) {
      return null;
    }

    const zipBuffer = await this.storage.rebuildPackageAsZip(
      query.tenantId,
      query.packageId
    );

    return {
      buffer: zipBuffer,
      packageName: session.packageName,
    };
  }

  private toDto(session: PretPackageSession): PretPackageDto {
    return {
      id: session.id,
      packageId: session.packageId,
      packageName: session.packageName,
      status: session.status,
      errorMessage: session.errorMessage,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }
}
