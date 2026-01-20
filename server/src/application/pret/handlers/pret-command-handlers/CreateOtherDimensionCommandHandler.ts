import * as yaml from 'js-yaml';
import type { 
  IPretCommandHandler, 
  IPretCommand,
  IPretCommandResult,
  CreateOtherDimensionArgs,
  CreateOtherDimensionResult,
  IPackageAnalysisCache
} from '../../../../domain/pret';
import type { IPretPackageStorage } from '../../../../domain/pret/interfaces/IPretPackageStorage';
import type { ISchemaValidator } from '../../../../domain/pret/interfaces/IPretValidator';
import type { AnalyzePackageHandler } from '../AnalyzePackageHandler';

interface OtherDimensionYaml {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    description: string;
    labels: {
      product: string;
      'model-name': string;
      'dimension-type': string;
      'dimension-name': string;
      'dimension-dbname': string;
      'package-state': string;
      environment: string;
      'pxcpm/id': string;
    };
  };
  spec: {
    name: string;
    members: Array<{ key: string; name: string }>;
    hierarchies: Array<{
      name: string;
      type: string;
      levels: Array<{ name: string; memberPropertyName: string }>;
      isDefault: boolean;
    }>;
    orderBy: string;
  };
}

interface ModelDependsOnEntry {
  kind: string;
  name: string;
}

interface ModelDimensionEntry {
  kind: string;
  name: string;
}

export class CreateOtherDimensionCommandHandler implements IPretCommandHandler<CreateOtherDimensionArgs, CreateOtherDimensionResult> {
  readonly commandType = 'createOtherDimension';

  private analyzeHandler: AnalyzePackageHandler | null = null;

  constructor(
    private readonly packageAnalysisCache: IPackageAnalysisCache,
    private readonly packageStorage: IPretPackageStorage,
    private readonly schemaValidator: ISchemaValidator
  ) {}

  setAnalyzeHandler(handler: AnalyzePackageHandler): void {
    this.analyzeHandler = handler;
  }

  async handle(command: IPretCommand<CreateOtherDimensionArgs>): Promise<IPretCommandResult<CreateOtherDimensionResult>> {
    const { modelName, dimensionName, dimensionKind, dimensionDescription } = command.args;
    const { packageId, tenantId } = command;

    const packageAnalysis = this.packageAnalysisCache.get(packageId);
    if (!packageAnalysis) {
      return {
        success: false,
        error: `Package ${packageId} not found or not analyzed yet`
      };
    }

    const cube = packageAnalysis.cubes.find(c => c.name === modelName);
    if (!cube) {
      const availableModels = packageAnalysis.cubes.map(c => c.name);
      return {
        success: false,
        error: `Model "${modelName}" not found in the package. Available models: ${availableModels.join(', ')}`
      };
    }

    const existingDimension = packageAnalysis.dimensions.find(
      d => d.name.toLowerCase() === dimensionName.toLowerCase() && d.modelName === modelName
    );
    if (existingDimension) {
      return {
        success: false,
        error: `A dimension named "${dimensionName}" already exists in model "${modelName}"`
      };
    }

    if (dimensionKind !== 'OtherDimension') {
      return {
        success: false,
        error: `Dimension kind "${dimensionKind}" is not yet supported. Currently only "OtherDimension" is implemented.`
      };
    }

    const dimensionYaml = this.generateDimensionYaml(dimensionName, dimensionDescription || '', modelName, dimensionKind);
    const dimensionYamlString = yaml.dump(dimensionYaml, { 
      indent: 2, 
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false
    });

    const validationResult = await this.schemaValidator.validateSchema(
      dimensionYamlString, 
      'Dimensions/other-dimension.schema.yaml'
    );

    if (!validationResult.isValid) {
      return {
        success: false,
        error: `Dimension validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`,
        data: {
          created: false,
          dimensionPath: '',
          modelPath: '',
          dimensionName,
          modelName,
          validationErrors: validationResult.errors.map(e => e.message)
        }
      };
    }

    const dimensionPath = cube.path ? this.deriveDimensionPath(cube.path, dimensionName) : `dimensions/${dimensionName}.yaml`;
    try {
      await this.packageStorage.saveFileContent(
        tenantId,
        packageId,
        dimensionPath,
        Buffer.from(dimensionYamlString, 'utf-8')
      );
    } catch (error) {
      return {
        success: false,
        error: `Failed to save dimension file: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }

    const modelUpdateResult = await this.updateModelFile(
      tenantId,
      packageId,
      modelName,
      dimensionName
    );

    if (!modelUpdateResult.success) {
      return {
        success: false,
        error: modelUpdateResult.error || 'Failed to update model file',
        data: {
          created: true,
          dimensionPath,
          modelPath: modelUpdateResult.modelPath || '',
          dimensionName,
          modelName,
          validationErrors: modelUpdateResult.validationErrors
        }
      };
    }

    console.log(`[CreateOtherDimensionCommandHandler] Successfully created dimension "${dimensionName}" for model "${modelName}"`);

    await this.reanalyzeAndUpdateCache(
      tenantId, 
      packageId, 
      packageAnalysis, 
      dimensionName, 
      dimensionKind, 
      dimensionPath, 
      modelName
    );

    return {
      success: true,
      data: {
        created: true,
        dimensionPath,
        modelPath: modelUpdateResult.modelPath!,
        dimensionName,
        modelName
      },
      message: `Successfully created dimension "${dimensionName}" and updated model "${modelName}"`
    };
  }

  /**
   * Re-analyzes the package from extracted files and updates both caches.
   * This ensures full fidelity with the actual package state.
   */
  private async reanalyzeAndUpdateCache(
    tenantId: string,
    packageId: string,
    currentAnalysis: { packageId: string; packageName: string; tenantId: string; dimensions: readonly { name: string; kind: string; path: string; modelName?: string; memberCount?: number }[]; cubes: readonly { name: string; path: string; dimensions?: string[] }[] },
    newDimensionName?: string,
    newDimensionKind?: string,
    newDimensionPath?: string,
    newDimensionModelName?: string
  ): Promise<void> {
    // Try re-analysis first for full fidelity
    if (this.analyzeHandler) {
      try {
        const freshDto = await this.analyzeHandler.handleFromExtractedFiles(tenantId, packageId);

        // Convert DTO to data cache format, preserving kind from model dimensions
        const freshDataCache = {
          packageId: freshDto.packageId,
          packageName: freshDto.packageName,
          tenantId,
          dimensions: freshDto.dimensions.map(d => {
            // Find the dimension kind from model dimensions
            const modelDim = freshDto.models
              .flatMap(m => m.dimensions)
              .find(md => md.name === d.name);
            return {
              name: d.name,
              kind: modelDim?.kind || 'Dimension',
              path: d.path,
              modelName: d.modelName,
              memberCount: d.accountCount
            };
          }),
          cubes: freshDto.models.map(m => ({
            name: m.name,
            path: m.path,
            dimensions: m.dimensions.map(dim => dim.name)
          }))
        };

        this.packageAnalysisCache.set(packageId, freshDataCache);
        this.packageAnalysisCache.setDto(packageId, freshDto);
        console.log(`[CreateOtherDimensionCommandHandler] Re-analyzed and updated both caches for package "${packageId}"`);
        return;
      } catch (error) {
        console.error(`[CreateOtherDimensionCommandHandler] Re-analysis failed, falling back to incremental update:`, error);
      }
    }

    // Fallback: incremental cache update when re-analysis not available or fails
    if (newDimensionName && newDimensionKind && newDimensionPath && newDimensionModelName) {
      const dimensionExists = currentAnalysis.dimensions.some(
        d => d.name === newDimensionName && d.modelName === newDimensionModelName
      );
      if (dimensionExists) {
        console.log(`[CreateOtherDimensionCommandHandler] Dimension "${newDimensionName}" already in cache, skipping update`);
        return;
      }

      const newDimension = {
        name: newDimensionName,
        kind: newDimensionKind,
        path: newDimensionPath,
        modelName: newDimensionModelName,
        memberCount: 1
      };

      const updatedCubes = currentAnalysis.cubes.map(cube => {
        if (cube.name === newDimensionModelName) {
          const existingDims = cube.dimensions || [];
          if (existingDims.includes(newDimensionName)) {
            return cube;
          }
          return { ...cube, dimensions: [...existingDims, newDimensionName] };
        }
        return cube;
      });

      const updatedAnalysis = {
        packageId: currentAnalysis.packageId,
        packageName: currentAnalysis.packageName,
        tenantId: currentAnalysis.tenantId,
        dimensions: [...currentAnalysis.dimensions, newDimension],
        cubes: updatedCubes
      };

      this.packageAnalysisCache.set(packageId, updatedAnalysis);
      console.log(`[CreateOtherDimensionCommandHandler] Updated data cache with incremental update for "${newDimensionName}"`);
    }
  }

  private generateDimensionYaml(
    dimensionName: string, 
    description: string, 
    modelName: string,
    dimensionKind: string
  ): OtherDimensionYaml {
    return {
      apiVersion: 'model.fpna.prophix.com/v1',
      kind: dimensionKind,
      metadata: {
        name: dimensionName,
        description: description || dimensionName,
        labels: {
          product: 'pxcpm',
          'model-name': modelName,
          'dimension-type': 'Other',
          'dimension-name': dimensionName,
          'dimension-dbname': dimensionName,
          'package-state': 'good',
          environment: 'production',
          'pxcpm/id': this.generatePxcpmId()
        }
      },
      spec: {
        name: dimensionName,
        members: [
          { key: '(All)', name: 'All' }
        ],
        hierarchies: [
          {
            name: dimensionName,
            type: 'ParentChild',
            levels: [
              { name: 'Key', memberPropertyName: 'Key' }
            ],
            isDefault: true
          }
        ],
        orderBy: 'Key'
      }
    };
  }

  private generatePxcpmId(): string {
    return String(Math.floor(Math.random() * 900000) + 100000);
  }

  private deriveDimensionPath(modelPath: string, dimensionName: string): string {
    if (modelPath.includes('/model/')) {
      const dimensionPath = modelPath.replace('/model/', '/dimensions/');
      const dimensionDir = dimensionPath.substring(0, dimensionPath.lastIndexOf('/'));
      return `${dimensionDir}/${dimensionName}.yaml`;
    }
    
    return `templates/pxcpm/dimensions/${dimensionName}.yaml`;
  }

  private async updateModelFile(
    tenantId: string,
    packageId: string,
    modelName: string,
    dimensionName: string
  ): Promise<{ success: boolean; error?: string; modelPath?: string; validationErrors?: string[] }> {
    const packageAnalysis = this.packageAnalysisCache.get(packageId);
    if (!packageAnalysis) {
      return {
        success: false,
        error: `Package ${packageId} not found in cache`
      };
    }

    const cube = packageAnalysis.cubes.find(c => c.name === modelName);
    if (!cube || !cube.path) {
      return {
        success: false,
        error: `Model "${modelName}" path not found in package analysis`
      };
    }

    const modelPath = cube.path;
    
    let modelContent: Buffer;
    try {
      modelContent = await this.packageStorage.getFileContent(tenantId, packageId, modelPath);
    } catch (error) {
      return {
        success: false,
        error: `Model file not found at ${modelPath}`,
        modelPath
      };
    }

    return await this.doUpdateModelFile(tenantId, packageId, modelPath, modelContent, dimensionName);
  }

  private async doUpdateModelFile(
    tenantId: string,
    packageId: string,
    modelPath: string,
    modelContent: Buffer,
    dimensionName: string
  ): Promise<{ success: boolean; error?: string; modelPath?: string; validationErrors?: string[] }> {
    let modelData: Record<string, unknown>;
    try {
      modelData = yaml.load(modelContent.toString('utf-8')) as Record<string, unknown>;
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse model YAML: ${error instanceof Error ? error.message : 'Unknown error'}`,
        modelPath
      };
    }

    const newDependency: ModelDependsOnEntry = {
      kind: 'OtherDimension',
      name: dimensionName
    };

    if (!modelData.dependsOn) {
      modelData.dependsOn = [];
    }
    const dependsOn = modelData.dependsOn as ModelDependsOnEntry[];
    
    const existsInDependsOn = dependsOn.some(
      d => d.kind === 'OtherDimension' && d.name === dimensionName
    );
    if (!existsInDependsOn) {
      dependsOn.push(newDependency);
    }

    const spec = modelData.spec as Record<string, unknown>;
    if (!spec) {
      return {
        success: false,
        error: 'Model file missing spec section',
        modelPath
      };
    }

    if (!spec.dimensions) {
      spec.dimensions = {};
    }
    const dimensions = spec.dimensions as Record<string, unknown>;

    if (!dimensions.other) {
      dimensions.other = [];
    }
    const otherDimensions = dimensions.other as ModelDimensionEntry[];

    const existsInOther = otherDimensions.some(
      d => d.kind === 'OtherDimension' && d.name === dimensionName
    );
    if (!existsInOther) {
      otherDimensions.push({
        kind: 'OtherDimension',
        name: dimensionName
      });
    }

    const updatedModelYaml = yaml.dump(modelData, {
      indent: 2,
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false
    });

    const modelValidation = await this.schemaValidator.validateSchema(
      updatedModelYaml,
      'Model/cube.schema.yaml'
    );

    if (!modelValidation.isValid) {
      console.warn(`[CreateOtherDimensionCommandHandler] Model validation warnings: ${modelValidation.errors.map(e => e.message).join(', ')}`);
    }

    try {
      await this.packageStorage.saveFileContent(
        tenantId,
        packageId,
        modelPath,
        Buffer.from(updatedModelYaml, 'utf-8')
      );
    } catch (error) {
      return {
        success: false,
        error: `Failed to save updated model file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        modelPath
      };
    }

    return {
      success: true,
      modelPath,
      validationErrors: modelValidation.errors.map(e => e.message)
    };
  }
}
