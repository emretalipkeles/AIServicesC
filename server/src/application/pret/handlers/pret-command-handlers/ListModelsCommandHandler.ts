import type { 
  IPretCommandHandler, 
  IPretCommand, 
  IPretCommandResult,
  ListModelsArgs,
  ListModelsResult,
  ModelInfo,
  DimensionReference
} from '../../../../domain/pret';
import type { IPackageAnalysisCache, PackageAnalysisData } from '../../../../domain/pret';

export class ListModelsCommandHandler implements IPretCommandHandler<ListModelsArgs, ListModelsResult> {
  readonly commandType = 'listModels';

  constructor(
    private readonly packageAnalysisCache: IPackageAnalysisCache
  ) {}

  async handle(command: IPretCommand<ListModelsArgs>): Promise<IPretCommandResult<ListModelsResult>> {
    const packageAnalysis = this.packageAnalysisCache.get(command.packageId);

    if (!packageAnalysis) {
      return {
        success: false,
        error: `Package ${command.packageId} not found or not analyzed yet`
      };
    }

    const models = this.extractModels(packageAnalysis, command.args.includeDetails ?? false);

    return {
      success: true,
      data: {
        models,
        totalCount: models.length
      },
      message: `Found ${models.length} model(s) in the package`
    };
  }

  private extractModels(packageAnalysis: PackageAnalysisData, includeDetails: boolean): ModelInfo[] {
    const modelMap = new Map<string, ModelInfo>();

    for (const cube of packageAnalysis.cubes) {
      const dimensions: DimensionReference[] = cube.dimensions?.map(d => ({
        kind: this.inferDimensionKind(d),
        name: d
      })) ?? [];

      modelMap.set(cube.name, {
        name: cube.name,
        displayName: cube.name,
        type: 'Cube',
        path: `models/${cube.name}`,
        dimensions
      });
    }

    for (const dim of packageAnalysis.dimensions) {
      if (dim.modelName && !modelMap.has(dim.modelName)) {
        modelMap.set(dim.modelName, {
          name: dim.modelName,
          displayName: dim.modelName,
          type: 'Model',
          path: `models/${dim.modelName}`,
          dimensions: []
        });
      }

      if (dim.modelName && modelMap.has(dim.modelName)) {
        const model = modelMap.get(dim.modelName)!;
        const existingDim = model.dimensions.find(d => d.name === dim.name);
        if (!existingDim) {
          model.dimensions.push({
            kind: dim.type || 'GenericDimension',
            name: dim.name
          });
        }
      }
    }

    return Array.from(modelMap.values());
  }

  private inferDimensionKind(dimensionName: string): string {
    const lowerName = dimensionName.toLowerCase();
    if (lowerName.includes('account')) return 'AccountDimension';
    if (lowerName.includes('time') || lowerName.includes('period')) return 'TimeDimension';
    if (lowerName.includes('version') || lowerName.includes('scenario')) return 'VersionDimension';
    if (lowerName.includes('entity') || lowerName.includes('company')) return 'EntityDimension';
    if (lowerName.includes('currency')) return 'CurrencyDimension';
    return 'GenericDimension';
  }
}
