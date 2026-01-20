import type { PretObjectTypeName } from '../value-objects/ObjectType';

export interface FileLocationResult {
  readonly found: boolean;
  readonly filePath?: string;
  readonly objectType?: PretObjectTypeName;
  readonly objectName?: string;
  readonly modelName?: string;
  readonly ambiguousMatches?: FileLocationMatch[];
  readonly clarificationNeeded?: string;
}

export interface MultiFileLocationResult {
  readonly found: boolean;
  readonly files: FileLocationMatch[];
  readonly modelName?: string;
  readonly error?: string;
}

export interface FileLocationMatch {
  readonly filePath: string;
  readonly objectType: PretObjectTypeName;
  readonly objectName: string;
  readonly modelName?: string;
}

export interface PackageAnalysisData {
  readonly packageId: string;
  readonly packageName: string;
  readonly tenantId: string;
  readonly dimensions: DimensionInfo[];
  readonly cubes: CubeInfo[];
}

export interface DimensionInfo {
  readonly name: string;
  readonly kind: string;
  readonly path: string;
  readonly modelName?: string;
  readonly memberCount?: number;
}

export interface CubeInfo {
  readonly name: string;
  readonly path: string;
  readonly dimensions?: string[];
}

export interface IPretFileLocator {
  locate(
    userIntent: string,
    packageAnalysis: PackageAnalysisData
  ): Promise<FileLocationResult>;

  locateByObjectType(
    objectType: PretObjectTypeName,
    objectName: string,
    packageAnalysis: PackageAnalysisData
  ): FileLocationResult;

  locateAllForModel(
    modelName: string,
    packageAnalysis: PackageAnalysisData
  ): MultiFileLocationResult;
}
