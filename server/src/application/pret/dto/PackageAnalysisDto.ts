export interface ModelDimensionDto {
  kind: string;
  name: string;
  path?: string;
  accountCount?: number;
  hasCalculations?: boolean;
}

export interface ModelDto {
  name: string;
  type: string;
  path: string;
  dimensions: ModelDimensionDto[];
}

export interface DimensionDto {
  name: string;
  modelName: string;
  path: string;
  accountCount: number;
  hasCalculations: boolean;
}

export interface TemplateDto {
  name: string;
  modelName: string;
  path: string;
}

export interface NamedSetDto {
  name: string;
  type: 'Dynamic' | 'Static';
  path: string;
}

export interface PackageAnalysisDto {
  packageId: string;
  packageName: string;
  models: ModelDto[];
  dimensions: DimensionDto[];
  templates: TemplateDto[];
  namedSets: NamedSetDto[];
  fileCount: number;
  analyzedAt: string;
}
