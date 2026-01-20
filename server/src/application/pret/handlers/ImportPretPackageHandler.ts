import type { ImportPretPackageCommand } from '../commands/ImportPretPackageCommand';
import type { IPretPackageStorage } from '../../../domain/pret/interfaces/IPretPackageStorage';
import type { IPretPackageSessionRepository } from '../../../domain/pret/interfaces/IPretPackageSessionRepository';
import { PretPackageSession } from '../../../domain/pret/entities/PretPackageSession';
import type { ImportPackageResultDto, PretPackageDto } from '../dto/PretPackageDto';

export class ImportPretPackageHandler {
  constructor(
    private readonly storage: IPretPackageStorage,
    private readonly sessionRepository: IPretPackageSessionRepository
  ) {}

  async handle(command: ImportPretPackageCommand): Promise<ImportPackageResultDto> {
    const validation = await this.storage.validatePackageStructure(command.fileBuffer);

    if (!validation.isValid) {
      return {
        success: false,
        packageId: command.packageId,
        error: `Invalid package: ${validation.errors.join(', ')}`,
      };
    }

    const packageName = validation.packageName || command.originalFilename.replace('.zip', '');

    const session = PretPackageSession.create(
      command.tenantId,
      command.packageId,
      packageName,
      ''
    );

    await this.sessionRepository.save(session);

    try {
      const uploadResult = await this.storage.uploadPackage(
        command.tenantId,
        command.packageId,
        command.fileBuffer,
        command.originalFilename
      );

      session.setS3Path(uploadResult.s3Path);
      session.markReady();
      await this.sessionRepository.update(session);

      return {
        success: true,
        packageId: command.packageId,
        packageName,
        session: this.toDto(session),
        redirectUrl: `/pret/${command.packageId}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during import';
      session.markError(errorMessage);
      await this.sessionRepository.update(session);

      return {
        success: false,
        packageId: command.packageId,
        error: errorMessage,
      };
    }
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
