import type { 
  IPretCommandHandler, 
  IPretCommand, 
  IPretCommandResult,
  GetCubeDetailsArgs,
  CubeDetailsResult,
  ModelInfo,
  DimensionReference,
  IFuzzyMatcher
} from '../../../../domain/pret';
import type { 
  IPackageAnalysisCache, 
  PackageAnalysisData,
  DimensionInfo as PackageDimensionInfo 
} from '../../../../domain/pret';
import type { DimensionInfo as CommandDimensionInfo } from '../../../../domain/pret/interfaces/IPretCommandResult';
import { FuzzyMatcher } from '../../../../domain/pret';

export class GetCubeDetailsCommandHandler implements IPretCommandHandler<GetCubeDetailsArgs, CubeDetailsResult> {
  readonly commandType = 'getCubeDetails';
  private readonly fuzzyMatcher: IFuzzyMatcher;

  constructor(
    private readonly packageAnalysisCache: IPackageAnalysisCache
  ) {
    this.fuzzyMatcher = new FuzzyMatcher();
  }

  async handle(command: IPretCommand<GetCubeDetailsArgs>): Promise<IPretCommandResult<CubeDetailsResult>> {
    const packageAnalysis = this.packageAnalysisCache.get(command.packageId);

    if (!packageAnalysis) {
      return {
        success: false,
        error: `Package ${command.packageId} not found or not analyzed yet`
      };
    }

    const { cubeName } = command.args;
    
    if (!cubeName) {
      const availableCubes = packageAnalysis.cubes.map(c => c.name).join(', ');
      return {
        success: false,
        error: `Please specify a cube/model name. Available cubes: ${availableCubes || 'none'}`
      };
    }

    const matchResult = this.findCubeWithFuzzyMatch(packageAnalysis, cubeName);

    if (!matchResult.cube) {
      const suggestionText = matchResult.suggestions.length > 0 
        ? `\n\nDid you mean: ${matchResult.suggestions.join(', ')}?`
        : '';
      const availableCubes = packageAnalysis.cubes.map(c => c.name).join(', ');
      return {
        success: false,
        error: `Cube "${cubeName}" not found.${suggestionText}\n\nAvailable cubes: ${availableCubes || 'none'}`
      };
    }

    const cube = matchResult.cube;

    const dimensionDetails = this.getDimensionDetails(packageAnalysis, cube.dimensions || []);

    const cubeModel: ModelInfo = {
      name: cube.name,
      displayName: cube.name,
      type: 'Cube',
      path: `models/${cube.name}`,
      dimensions: cube.dimensions?.map(d => ({
        kind: this.inferDimensionKind(d),
        name: d
      })) ?? []
    };

    return {
      success: true,
      data: {
        cube: cubeModel,
        dimensionDetails
      },
      message: `Cube "${cubeName}" has ${dimensionDetails.length} dimension(s)`
    };
  }

  private findCubeWithFuzzyMatch(
    packageAnalysis: PackageAnalysisData, 
    cubeName: string
  ): { cube: PackageAnalysisData['cubes'][0] | null; suggestions: string[] } {
    const candidateNames = packageAnalysis.cubes.map(c => c.name);
    const matchResult = this.fuzzyMatcher.findBestMatch(cubeName, candidateNames);

    if (matchResult.match) {
      const matchedCube = packageAnalysis.cubes.find(c => c.name === matchResult.match);
      return { 
        cube: matchedCube || null, 
        suggestions: matchResult.suggestions 
      };
    }

    return { 
      cube: null, 
      suggestions: matchResult.suggestions 
    };
  }

  private getDimensionDetails(
    packageAnalysis: PackageAnalysisData,
    cubeDimensions: string[]
  ): CommandDimensionInfo[] {
    const details: CommandDimensionInfo[] = [];

    for (const dimName of cubeDimensions) {
      const dim = packageAnalysis.dimensions.find(
        d => d.name.toLowerCase() === dimName.toLowerCase()
      );

      if (dim) {
        details.push({
          name: dim.name,
          kind: dim.kind || this.inferDimensionKind(dim.name),
          modelName: dim.modelName || '',
          path: dim.path || `dimensions/${dim.name}`,
          memberCount: dim.memberCount || 0,
          hasCalculations: false,
          description: undefined
        });
      } else {
        details.push({
          name: dimName,
          kind: this.inferDimensionKind(dimName),
          modelName: '',
          path: `dimensions/${dimName}`,
          memberCount: 0,
          hasCalculations: false,
          description: 'Dimension referenced but not found in package'
        });
      }
    }

    return details;
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
