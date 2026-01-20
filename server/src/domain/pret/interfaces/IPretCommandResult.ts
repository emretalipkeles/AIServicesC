export interface IPretCommandResult<TData = unknown> {
  readonly success: boolean;
  readonly data?: TData;
  readonly error?: string;
  readonly message?: string;
}

export interface ModelInfo {
  name: string;
  displayName?: string;
  type: string;
  path: string;
  dimensions: DimensionReference[];
  includeCurrency?: boolean;
  includeDetailedPlanning?: boolean;
}

export interface DimensionReference {
  kind: string;
  name: string;
}

export interface DimensionInfo {
  name: string;
  kind: string;
  modelName: string;
  path: string;
  memberCount: number;
  hasCalculations: boolean;
  description?: string;
}

export interface CubeDetailsResult {
  cube: ModelInfo;
  dimensionDetails: DimensionInfo[];
}

export interface DimensionDetailsResult {
  dimension: DimensionInfo;
  members?: MemberSummary[];
  customProperties?: PropertyDefinition[];
}

export interface MemberSummary {
  key: string;
  name: string;
  parent?: string;
  hasChildren: boolean;
}

export interface PropertyDefinition {
  name: string;
  valueType: string;
  description?: string;
}

export interface ListModelsResult {
  models: ModelInfo[];
  totalCount: number;
}

export interface ListDimensionsResult {
  dimensions: DimensionInfo[];
  totalCount: number;
}

export interface UpdateResult {
  updated: boolean;
  path: string;
  validationErrors?: string[];
}

export interface CreateOtherDimensionResult {
  created: boolean;
  dimensionPath: string;
  modelPath: string;
  dimensionName: string;
  modelName: string;
  validationErrors?: string[];
}
