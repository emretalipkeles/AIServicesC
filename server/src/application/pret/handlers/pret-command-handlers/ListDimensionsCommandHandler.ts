import type { 
  IPretCommandHandler, 
  IPretCommand, 
  IPretCommandResult,
  ListDimensionsArgs,
  ListDimensionsResult
} from '../../../../domain/pret';
import type { IPackageAnalysisCache, PackageAnalysisData } from '../../../../domain/pret';
import type { DimensionInfo } from '../../../../domain/pret/interfaces/IPretCommandResult';

export class ListDimensionsCommandHandler implements IPretCommandHandler<ListDimensionsArgs, ListDimensionsResult> {
  readonly commandType = 'listDimensions';

  constructor(
    private readonly packageAnalysisCache: IPackageAnalysisCache
  ) {}

  async handle(command: IPretCommand<ListDimensionsArgs>): Promise<IPretCommandResult<ListDimensionsResult>> {
    const packageAnalysis = this.packageAnalysisCache.get(command.packageId);

    if (!packageAnalysis) {
      return {
        success: false,
        error: `Package ${command.packageId} not found or not analyzed yet`
      };
    }

    const { modelName, dimensionType } = command.args;
    let dimensions = this.extractDimensions(packageAnalysis);

    if (modelName) {
      const lowerModelName = modelName.toLowerCase();
      dimensions = dimensions.filter(d => d.modelName.toLowerCase() === lowerModelName);
    }

    if (dimensionType) {
      const lowerType = dimensionType.toLowerCase();
      dimensions = dimensions.filter(d => d.kind.toLowerCase().includes(lowerType));
    }

    let message = `Found ${dimensions.length} dimension(s)`;
    if (modelName) message += ` for model "${modelName}"`;
    if (dimensionType) message += ` of type "${dimensionType}"`;

    return {
      success: true,
      data: {
        dimensions,
        totalCount: dimensions.length
      },
      message
    };
  }

  private extractDimensions(packageAnalysis: PackageAnalysisData): DimensionInfo[] {
    return packageAnalysis.dimensions.map(dim => ({
      name: dim.name,
      kind: dim.type || this.inferDimensionKind(dim.name),
      modelName: dim.modelName || 'Unknown',
      path: dim.path || `dimensions/${dim.name}`,
      memberCount: dim.memberCount || 0,
      hasCalculations: false,
      description: undefined
    }));
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
