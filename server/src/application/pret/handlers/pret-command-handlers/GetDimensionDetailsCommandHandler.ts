import type { 
  IPretCommandHandler, 
  IPretCommand, 
  IPretCommandResult,
  GetDimensionDetailsArgs,
  DimensionDetailsResult,
  IFuzzyMatcher
} from '../../../../domain/pret';
import type { IPackageAnalysisCache, PackageAnalysisData } from '../../../../domain/pret';
import type { DimensionInfo, PropertyDefinition } from '../../../../domain/pret/interfaces/IPretCommandResult';
import { FuzzyMatcher } from '../../../../domain/pret';

export class GetDimensionDetailsCommandHandler implements IPretCommandHandler<GetDimensionDetailsArgs, DimensionDetailsResult> {
  readonly commandType = 'getDimensionDetails';
  private readonly fuzzyMatcher: IFuzzyMatcher;

  constructor(
    private readonly packageAnalysisCache: IPackageAnalysisCache
  ) {
    this.fuzzyMatcher = new FuzzyMatcher();
  }

  async handle(command: IPretCommand<GetDimensionDetailsArgs>): Promise<IPretCommandResult<DimensionDetailsResult>> {
    const packageAnalysis = this.packageAnalysisCache.get(command.packageId);

    if (!packageAnalysis) {
      return {
        success: false,
        error: `Package ${command.packageId} not found or not analyzed yet`
      };
    }

    const { dimensionName, modelName } = command.args;
    
    if (!dimensionName) {
      const availableDims = packageAnalysis.dimensions.map(d => d.name).join(', ');
      return {
        success: false,
        error: `Please specify a dimension name. Available dimensions: ${availableDims || 'none'}`
      };
    }

    const matchResult = this.findDimensionWithFuzzyMatch(packageAnalysis, dimensionName, modelName);

    if (!matchResult.dimension) {
      const suggestionText = matchResult.suggestions.length > 0 
        ? `\n\nDid you mean: ${matchResult.suggestions.join(', ')}?`
        : '';
      const availableDims = packageAnalysis.dimensions.slice(0, 10).map(d => d.name).join(', ');
      const moreText = packageAnalysis.dimensions.length > 10 ? ` (and ${packageAnalysis.dimensions.length - 10} more)` : '';
      return {
        success: false,
        error: `No dimensions found matching "${dimensionName}"${modelName ? ` in model "${modelName}"` : ''}.${suggestionText}\n\nAvailable dimensions: ${availableDims}${moreText}`
      };
    }

    const dimension = matchResult.dimension;

    const dimensionInfo: DimensionInfo = {
      name: dimension.name,
      kind: dimension.kind || this.inferDimensionKind(dimension.name),
      modelName: dimension.modelName || 'Unknown',
      path: dimension.path || `dimensions/${dimension.name}`,
      memberCount: dimension.memberCount || 0,
      hasCalculations: false,
      description: undefined
    };

    const customProperties = this.getStandardProperties(dimensionInfo.kind);

    return {
      success: true,
      data: {
        dimension: dimensionInfo,
        members: undefined,
        customProperties
      },
      message: `Dimension "${dimensionName}" has ${dimensionInfo.memberCount} member(s)`
    };
  }

  private findDimensionWithFuzzyMatch(
    packageAnalysis: PackageAnalysisData,
    dimensionName: string,
    modelName?: string
  ): { dimension: PackageAnalysisData['dimensions'][0] | null; suggestions: string[] } {
    const candidates = modelName
      ? packageAnalysis.dimensions.filter(d => 
          d.modelName?.toLowerCase() === modelName.toLowerCase()
        )
      : packageAnalysis.dimensions;

    if (candidates.length === 0) {
      return { dimension: null, suggestions: [] };
    }

    const candidateNames = candidates.map(d => d.name);
    const matchResult = this.fuzzyMatcher.findBestMatch(dimensionName, candidateNames);

    if (matchResult.match) {
      const matchedDimension = candidates.find(d => d.name === matchResult.match);
      return { 
        dimension: matchedDimension || null, 
        suggestions: matchResult.suggestions 
      };
    }

    return { 
      dimension: null, 
      suggestions: matchResult.suggestions 
    };
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

  private getStandardProperties(kind: string): PropertyDefinition[] {
    const baseProperties: PropertyDefinition[] = [
      { name: 'key', valueType: 'Text', description: 'Unique identifier for the member' },
      { name: 'name', valueType: 'Text', description: 'Display name of the member' },
      { name: 'parent', valueType: 'Text', description: 'Parent member key' }
    ];

    if (kind === 'AccountDimension') {
      return [
        ...baseProperties,
        { name: 'accountType', valueType: 'Text', description: 'Type of account (Asset, Liability, etc.)' },
        { name: 'rollUp', valueType: 'Text', description: 'Roll-up behavior (+, -, ~)' },
        { name: 'calculationMethod', valueType: 'Text', description: 'How values are calculated' }
      ];
    }

    if (kind === 'TimeDimension') {
      return [
        ...baseProperties,
        { name: 'periodType', valueType: 'Text', description: 'Type of period (Year, Quarter, Month)' },
        { name: 'startDate', valueType: 'Date', description: 'Start date of the period' },
        { name: 'endDate', valueType: 'Date', description: 'End date of the period' }
      ];
    }

    if (kind === 'VersionDimension') {
      return [
        ...baseProperties,
        { name: 'versionType', valueType: 'Text', description: 'Type of version (Actual, Budget, Forecast)' },
        { name: 'isLocked', valueType: 'Boolean', description: 'Whether the version is locked' }
      ];
    }

    return baseProperties;
  }
}
