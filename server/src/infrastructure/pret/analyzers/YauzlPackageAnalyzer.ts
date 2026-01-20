import yauzl from 'yauzl';
import yaml from 'js-yaml';
import type { IPackageAnalyzer } from '../../../domain/pret/interfaces/IPackageAnalyzer';
import type { 
  PackageStructure, 
  ModelInfo, 
  DimensionInfo, 
  DimensionDependency,
  TemplateInfo, 
  NamedSetInfo,
  PackageMetadata 
} from '../../../domain/pret/value-objects/PackageStructure';

interface ParsedModel {
  name: string;
  displayName: string;
  type: string;
  path: string;
  dependsOn: Array<{ kind: string; name: string }>;
}

interface ParsedDimension {
  name: string;
  kind: string;
  specName: string;
  modelName: string;
  path: string;
  accountCount: number;
  hasCalculations: boolean;
}

interface YamlDocument {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    description?: string;
    labels?: Record<string, string>;
  };
  dependsOn?: Array<{ kind: string; name: string }>;
  spec?: {
    name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export class YauzlPackageAnalyzer implements IPackageAnalyzer {
  async analyzeFromFile(zipFilePath: string): Promise<PackageStructure> {
    const entries = await this.getAllEntriesFromFile(zipFilePath);
    
    let metadata: PackageMetadata = { name: 'Unknown' };
    const parsedModels: ParsedModel[] = [];
    const parsedDimensions: ParsedDimension[] = [];
    const templates: TemplateInfo[] = [];
    const namedSets: NamedSetInfo[] = [];

    for (const entry of entries) {
      const path = entry.fileName;
      
      if (path === 'package.yaml' || path.endsWith('/package.yaml')) {
        const content = await this.extractFileFromZip(zipFilePath, path);
        metadata = this.parsePackageYaml(content.toString('utf-8'));
      }
      // Models: legacy Models/<name>/Model.yaml OR templates/pxcpm/model/<name>.yaml
      else if (path.match(/Models\/[^/]+\/Model\.yaml$/i) || 
               path.match(/templates\/[^/]+\/model\/[^/]+\.yaml$/i)) {
        const content = await this.extractFileFromZip(zipFilePath, path);
        const modelInfo = this.parseModelYaml(content.toString('utf-8'), path);
        if (modelInfo) parsedModels.push(modelInfo);
      }
      // Dimensions: legacy Models/<model>/Dimensions/<dim>.yaml OR templates/pxcpm/dimensions/<dim>.yaml
      else if (path.match(/Models\/[^/]+\/Dimensions\/[^/]+\.yaml$/i) ||
               path.match(/templates\/[^/]+\/dimensions\/[^/]+\.yaml$/i)) {
        const content = await this.extractFileFromZip(zipFilePath, path);
        const dimInfo = this.parseDimensionYaml(content.toString('utf-8'), path);
        if (dimInfo) parsedDimensions.push(dimInfo);
      }
      else if (path.match(/Templates\/[^/]+\.yaml$/i)) {
        const content = await this.extractFileFromZip(zipFilePath, path);
        const templateInfo = this.parseTemplateYaml(content.toString('utf-8'), path);
        if (templateInfo) templates.push(templateInfo);
      }
      // NamedSets: legacy NamedSets/ OR templates/pxcpm/namedSets/
      else if (path.match(/NamedSets\/[^/]+\.yaml$/i) ||
               path.match(/templates\/[^/]+\/namedSets\/[^/]+\.yaml$/i)) {
        const content = await this.extractFileFromZip(zipFilePath, path);
        const namedSetInfo = this.parseNamedSetYaml(content.toString('utf-8'), path);
        if (namedSetInfo) namedSets.push(namedSetInfo);
      }
    }

    const models = this.buildModelWithDimensions(parsedModels, parsedDimensions);
    const dimensions = this.convertToExportedDimensions(parsedDimensions);

    return {
      metadata,
      models,
      dimensions,
      templates,
      namedSets,
      fileCount: entries.filter(e => !e.fileName.endsWith('/')).length,
      analyzedAt: new Date(),
    };
  }

  private buildModelWithDimensions(
    parsedModels: ParsedModel[],
    parsedDimensions: ParsedDimension[]
  ): ModelInfo[] {
    return parsedModels.map(model => {
      let dimensions: DimensionDependency[];
      
      if (model.dependsOn.length > 0) {
        // Use explicit dependsOn if available (legacy structure)
        dimensions = model.dependsOn.map(dep => {
          const matchedDim = this.findMatchingDimension(dep, parsedDimensions);

          return {
            kind: dep.kind,
            name: dep.name,
            path: matchedDim?.path,
            accountCount: matchedDim?.accountCount,
            hasCalculations: matchedDim?.hasCalculations,
          };
        });
      } else {
        // Fallback: find dimensions by modelName association (templates structure)
        const modelNameLower = model.name.toLowerCase();
        const associatedDims = parsedDimensions.filter(d => 
          d.modelName.toLowerCase() === modelNameLower
        );
        
        dimensions = associatedDims.map(dim => ({
          kind: dim.kind,
          name: dim.specName || dim.name,
          path: dim.path,
          accountCount: dim.accountCount,
          hasCalculations: dim.hasCalculations,
        }));
      }

      return {
        name: model.name,
        displayName: model.displayName,
        type: model.type,
        path: model.path,
        dimensions,
      };
    });
  }

  private findMatchingDimension(
    dep: { kind: string; name: string },
    parsedDimensions: ParsedDimension[]
  ): ParsedDimension | undefined {
    const depKindLower = dep.kind.toLowerCase();
    const depNameLower = dep.name.toLowerCase();

    return parsedDimensions.find(d => {
      const kindMatch = d.kind.toLowerCase() === depKindLower;
      
      if (!kindMatch) return false;

      const specNameLower = d.specName.toLowerCase();
      const fileNameLower = d.name.toLowerCase();
      
      return specNameLower === depNameLower || fileNameLower === depNameLower;
    });
  }

  private convertToExportedDimensions(parsedDimensions: ParsedDimension[]): DimensionInfo[] {
    return parsedDimensions.map(d => ({
      name: d.name,
      kind: d.kind,
      specName: d.specName,
      modelName: d.modelName,
      path: d.path,
      accountCount: d.accountCount,
      hasCalculations: d.hasCalculations,
    }));
  }

  async getFileListFromFile(zipFilePath: string): Promise<string[]> {
    const entries = await this.getAllEntriesFromFile(zipFilePath);
    return entries
      .filter(e => !e.fileName.endsWith('/'))
      .map(e => e.fileName);
  }

  async extractFileFromZip(zipFilePath: string, targetPath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipFile) => {
        if (err || !zipFile) {
          reject(err || new Error('Failed to open ZIP'));
          return;
        }

        let found = false;

        zipFile.on('entry', (entry: yauzl.Entry) => {
          if (entry.fileName === targetPath) {
            found = true;
            zipFile.openReadStream(entry, (streamErr, readStream) => {
              if (streamErr || !readStream) {
                reject(streamErr || new Error('Failed to open stream'));
                return;
              }

              const chunks: Buffer[] = [];
              readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
              readStream.on('end', () => {
                resolve(Buffer.concat(chunks));
                zipFile.close();
              });
              readStream.on('error', reject);
            });
          } else {
            zipFile.readEntry();
          }
        });

        zipFile.on('end', () => {
          if (!found) {
            reject(new Error(`File not found: ${targetPath}`));
          }
        });

        zipFile.on('error', reject);
        zipFile.readEntry();
      });
    });
  }

  private getAllEntriesFromFile(zipFilePath: string): Promise<yauzl.Entry[]> {
    return new Promise((resolve, reject) => {
      yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipFile) => {
        if (err || !zipFile) {
          reject(err || new Error('Failed to open ZIP'));
          return;
        }

        const entries: yauzl.Entry[] = [];

        zipFile.on('entry', (entry: yauzl.Entry) => {
          entries.push(entry);
          zipFile.readEntry();
        });

        zipFile.on('end', () => {
          zipFile.close();
          resolve(entries);
        });

        zipFile.on('error', reject);
        zipFile.readEntry();
      });
    });
  }

  private parsePackageYaml(content: string): PackageMetadata {
    const nameMatch = content.match(/name:\s*['"]?([^'"\n]+)['"]?/);
    const versionMatch = content.match(/version:\s*['"]?([^'"\n]+)['"]?/);
    const descMatch = content.match(/description:\s*['"]?([^'"\n]+)['"]?/);

    return {
      name: nameMatch?.[1]?.trim() || 'Unknown',
      version: versionMatch?.[1]?.trim(),
      description: descMatch?.[1]?.trim(),
    };
  }

  private parseModelYaml(content: string, path: string): ParsedModel | null {
    // Support both: Models/<name>/Model.yaml AND templates/pxcpm/model/<name>.yaml
    const legacyMatch = path.match(/Models\/([^/]+)\/Model\.yaml$/i);
    const templateMatch = path.match(/templates\/[^/]+\/model\/([^/]+)\.yaml$/i);
    
    const pathMatch = legacyMatch || templateMatch;
    if (!pathMatch) return null;

    const modelNameFromPath = pathMatch[1].replace(/\.yaml$/i, '');

    try {
      const doc = yaml.load(content) as YamlDocument;
      
      const displayName = doc?.metadata?.labels?.['model-name'] || 
                         doc?.spec?.name ||
                         modelNameFromPath;
      const cubeType = doc?.metadata?.labels?.['cube-type'] || 
                       doc?.kind ||
                       (doc as Record<string, unknown>)?.type as string || 
                       'GenericModel';
      
      const dependsOn = this.extractDependsOn(doc);

      return {
        name: modelNameFromPath,
        displayName,
        type: cubeType,
        path,
        dependsOn,
      };
    } catch {
      return {
        name: modelNameFromPath,
        displayName: modelNameFromPath,
        type: 'GenericModel',
        path,
        dependsOn: [],
      };
    }
  }

  private extractDependsOn(doc: YamlDocument): Array<{ kind: string; name: string }> {
    if (!doc?.dependsOn || !Array.isArray(doc.dependsOn)) {
      return [];
    }

    return doc.dependsOn
      .filter((dep): dep is { kind: string; name: string } => 
        typeof dep?.kind === 'string' && typeof dep?.name === 'string'
      )
      .map(dep => ({
        kind: dep.kind.trim(),
        name: dep.name.trim(),
      }));
  }

  private parseDimensionYaml(content: string, path: string): ParsedDimension | null {
    // Support both: Models/<model>/Dimensions/<dim>.yaml AND templates/pxcpm/dimensions/<dim>.yaml
    const legacyMatch = path.match(/Models\/([^/]+)\/Dimensions\/([^/]+)\.yaml$/i);
    const templateMatch = path.match(/templates\/[^/]+\/dimensions\/([^/]+)\.yaml$/i);
    
    if (!legacyMatch && !templateMatch) return null;

    const accountMatches = content.match(/- key:/gi);
    const hasCalcs = /Formula Syntax:/i.test(content) || /calculations:/i.test(content);

    try {
      const doc = yaml.load(content) as YamlDocument;
      
      const kind = doc?.kind || 'Unknown';
      
      // For legacy path, get model from path; for template path, get from YAML or use 'Shared'
      let modelName: string;
      let dimName: string;
      
      if (legacyMatch) {
        modelName = legacyMatch[1];
        dimName = legacyMatch[2];
      } else {
        dimName = templateMatch![1];
        // Try to get model association from YAML metadata
        const labelModel = doc?.metadata?.labels?.['model-name'];
        const specModel = doc?.spec?.model;
        modelName = (typeof labelModel === 'string' ? labelModel : undefined) || 
                   (typeof specModel === 'string' ? specModel : undefined) ||
                   'Shared';
      }
      
      const specName = doc?.spec?.name || doc?.metadata?.name || dimName;

      return {
        name: dimName,
        kind,
        specName,
        modelName,
        path,
        accountCount: accountMatches?.length || 0,
        hasCalculations: hasCalcs,
      };
    } catch {
      const dimName = legacyMatch ? legacyMatch[2] : templateMatch![1];
      const modelName = legacyMatch ? legacyMatch[1] : 'Shared';
      
      return {
        name: dimName,
        kind: 'Unknown',
        specName: dimName,
        modelName,
        path,
        accountCount: accountMatches?.length || 0,
        hasCalculations: hasCalcs,
      };
    }
  }

  private parseTemplateYaml(content: string, path: string): TemplateInfo | null {
    const nameMatch = path.match(/Templates\/([^/]+)\.yaml$/i);
    const modelMatch = content.match(/model:\s*['"]?([^'"\n]+)['"]?/i);

    if (nameMatch) {
      return {
        name: nameMatch[1],
        modelName: modelMatch?.[1]?.trim() || 'Unknown',
        path,
      };
    }
    return null;
  }

  private parseNamedSetYaml(content: string, path: string): NamedSetInfo | null {
    // Support both: NamedSets/<name>.yaml AND templates/pxcpm/namedSets/<name>.yaml
    const legacyMatch = path.match(/NamedSets\/([^/]+)\.yaml$/i);
    const templateMatch = path.match(/templates\/[^/]+\/namedSets\/([^/]+)\.yaml$/i);
    
    const nameMatch = legacyMatch || templateMatch;
    const isDynamic = /dynamic:\s*true/i.test(content) || /type:\s*['"]?dynamic/i.test(content);

    if (nameMatch) {
      return {
        name: nameMatch[1],
        type: isDynamic ? 'Dynamic' : 'Static',
        path,
      };
    }
    return null;
  }
}
