export type PretCommandType = 
  | 'listModels'
  | 'listDimensions'
  | 'getCubeDetails'
  | 'getDimensionDetails'
  | 'updateCube'
  | 'updateDimension'
  | 'createOtherDimension'
  | 'outOfScope';

export interface IPretCommand<TArgs = unknown> {
  readonly type: PretCommandType;
  readonly args: TArgs;
  readonly packageId: string;
  readonly tenantId: string;
}

export interface ListModelsArgs {
  includeDetails?: boolean;
}

export interface ListDimensionsArgs {
  modelName?: string;
  dimensionType?: string;
}

export interface GetCubeDetailsArgs {
  cubeName: string;
}

export interface GetDimensionDetailsArgs {
  dimensionName: string;
  modelName?: string;
}

export interface UpdateCubeArgs {
  cubeName: string;
  updates: Record<string, unknown>;
}

export interface UpdateDimensionArgs {
  dimensionName: string;
  modelName?: string;
  updates: Record<string, unknown>;
}

export type DimensionKind = 'OtherDimension' | 'AccountDimension' | 'TimeDimension';

export interface CreateOtherDimensionArgs {
  modelName: string;
  dimensionName: string;
  dimensionKind: DimensionKind;
  dimensionDescription?: string;
}
