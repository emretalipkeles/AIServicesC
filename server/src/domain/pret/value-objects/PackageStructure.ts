export interface DimensionDependency {
  kind: string;
  name: string;
  path?: string;
  accountCount?: number;
  hasCalculations?: boolean;
}

export interface ModelInfo {
  name: string;
  displayName: string;
  type: string;
  path: string;
  dimensions: DimensionDependency[];
}

export interface DimensionInfo {
  name: string;
  kind: string;
  specName: string;
  modelName: string;
  path: string;
  accountCount: number;
  hasCalculations: boolean;
}

export interface TemplateInfo {
  name: string;
  modelName: string;
  path: string;
}

export interface NamedSetInfo {
  name: string;
  type: 'Dynamic' | 'Static';
  path: string;
}

export interface PackageMetadata {
  name: string;
  version?: string;
  description?: string;
}

export interface PackageStructure {
  metadata: PackageMetadata;
  models: ModelInfo[];
  dimensions: DimensionInfo[];
  templates: TemplateInfo[];
  namedSets: NamedSetInfo[];
  fileCount: number;
  analyzedAt: Date;
}

export function createEmptyPackageStructure(packageName: string): PackageStructure {
  return {
    metadata: { name: packageName },
    models: [],
    dimensions: [],
    templates: [],
    namedSets: [],
    fileCount: 0,
    analyzedAt: new Date(),
  };
}
