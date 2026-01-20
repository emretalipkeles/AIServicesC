import type { PackageSessionStatus } from '../../../domain/pret/entities/PretPackageSession';

export interface PretPackageDto {
  id: string;
  packageId: string;
  packageName: string;
  status: PackageSessionStatus;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportPackageResultDto {
  success: boolean;
  packageId: string;
  packageName?: string;
  session?: PretPackageDto;
  error?: string;
  redirectUrl?: string;
}

export interface PackageContentsDto {
  packageId: string;
  files: string[];
}
