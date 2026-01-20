import type { 
  IPretFileLocator, 
  PackageAnalysisData, 
  FileLocationResult,
  FileLocationMatch,
  MultiFileLocationResult,
  PretObjectTypeName 
} from '../../../domain/pret';

export class PackageAnalysisPretFileLocator implements IPretFileLocator {
  private readonly objectTypeKeywords: Map<PretObjectTypeName, string[]> = new Map([
    ['AccountDimension', ['account', 'chart of accounts', 'coa', 'accounts', 'account dimension']],
    ['TimeDimension', ['time', 'period', 'periods', 'time dimension', 'calendar', 'year', 'month']],
    ['VersionDimension', ['version', 'versions', 'scenario', 'scenarios', 'version dimension']],
    ['CurrencyDimension', ['currency', 'currencies', 'fx', 'currency dimension']],
    ['EntityDimension', ['entity', 'entities', 'company', 'companies', 'entity dimension', 'org']],
    ['OtherDimension', ['department', 'product', 'customer', 'region', 'cost center', 'project', 'dimension']],
    ['Cube', ['cube', 'model', 'cubes', 'models']],
  ]);

  async locate(
    userIntent: string,
    packageAnalysis: PackageAnalysisData
  ): Promise<FileLocationResult> {
    const normalizedIntent = userIntent.toLowerCase().trim();
    
    const exactNameMatch = this.findExactNameMatch(normalizedIntent, packageAnalysis);
    if (exactNameMatch) {
      return {
        found: true,
        filePath: exactNameMatch.filePath,
        objectType: exactNameMatch.objectType,
        objectName: exactNameMatch.objectName,
        modelName: exactNameMatch.modelName,
      };
    }

    const objectType = this.detectObjectType(normalizedIntent);
    if (objectType) {
      const matches = this.findMatchesByType(objectType, packageAnalysis);
      
      if (matches.length === 0) {
        return {
          found: false,
          clarificationNeeded: `No ${objectType} found in the package.`,
        };
      }
      
      if (matches.length === 1) {
        return {
          found: true,
          filePath: matches[0].filePath,
          objectType: matches[0].objectType,
          objectName: matches[0].objectName,
          modelName: matches[0].modelName,
        };
      }

      const specificMatch = this.findSpecificMatch(normalizedIntent, matches);
      if (specificMatch) {
        return {
          found: true,
          filePath: specificMatch.filePath,
          objectType: specificMatch.objectType,
          objectName: specificMatch.objectName,
          modelName: specificMatch.modelName,
        };
      }

      return {
        found: false,
        ambiguousMatches: matches,
        clarificationNeeded: this.buildClarificationMessage(matches, objectType),
      };
    }

    const fuzzyMatches = this.findFuzzyMatches(normalizedIntent, packageAnalysis);
    if (fuzzyMatches.length === 1) {
      return {
        found: true,
        filePath: fuzzyMatches[0].filePath,
        objectType: fuzzyMatches[0].objectType,
        objectName: fuzzyMatches[0].objectName,
        modelName: fuzzyMatches[0].modelName,
      };
    }

    if (fuzzyMatches.length > 1) {
      return {
        found: false,
        ambiguousMatches: fuzzyMatches,
        clarificationNeeded: this.buildClarificationMessage(fuzzyMatches),
      };
    }

    return {
      found: false,
      clarificationNeeded: 'Could not identify which file you want to work with. Please specify the dimension or model name.',
    };
  }

  locateByObjectType(
    objectType: PretObjectTypeName,
    objectName: string,
    packageAnalysis: PackageAnalysisData
  ): FileLocationResult {
    const normalizedName = objectName.toLowerCase();

    if (objectType === 'Cube') {
      const cube = packageAnalysis.cubes.find(
        c => c.name.toLowerCase() === normalizedName
      );
      if (cube) {
        return {
          found: true,
          filePath: cube.path,
          objectType: 'Cube',
          objectName: cube.name,
        };
      }
    } else {
      const dimension = packageAnalysis.dimensions.find(
        d => d.name.toLowerCase() === normalizedName && 
             this.mapKindToObjectType(d.kind) === objectType
      );
      if (dimension) {
        return {
          found: true,
          filePath: dimension.path,
          objectType: this.mapKindToObjectType(dimension.kind),
          objectName: dimension.name,
          modelName: dimension.modelName,
        };
      }
    }

    return {
      found: false,
      clarificationNeeded: `Could not find ${objectType} named "${objectName}".`,
    };
  }

  private findExactNameMatch(
    intent: string,
    packageAnalysis: PackageAnalysisData
  ): FileLocationMatch | null {
    for (const dim of packageAnalysis.dimensions) {
      if (intent.includes(dim.name.toLowerCase())) {
        return {
          filePath: dim.path,
          objectType: this.mapKindToObjectType(dim.kind),
          objectName: dim.name,
          modelName: dim.modelName,
        };
      }
    }

    for (const cube of packageAnalysis.cubes) {
      if (intent.includes(cube.name.toLowerCase())) {
        return {
          filePath: cube.path,
          objectType: 'Cube',
          objectName: cube.name,
        };
      }
    }

    return null;
  }

  private detectObjectType(intent: string): PretObjectTypeName | null {
    const entries = Array.from(this.objectTypeKeywords.entries());
    for (const [type, keywords] of entries) {
      if (keywords.some((kw: string) => intent.includes(kw))) {
        return type;
      }
    }
    return null;
  }

  private findMatchesByType(
    objectType: PretObjectTypeName,
    packageAnalysis: PackageAnalysisData
  ): FileLocationMatch[] {
    if (objectType === 'Cube') {
      return packageAnalysis.cubes.map(cube => ({
        filePath: cube.path,
        objectType: 'Cube' as PretObjectTypeName,
        objectName: cube.name,
      }));
    }

    return packageAnalysis.dimensions
      .filter(dim => {
        const dimType = this.mapKindToObjectType(dim.kind);
        if (objectType === 'OtherDimension') {
          return !['AccountDimension', 'TimeDimension', 'VersionDimension', 
                   'CurrencyDimension', 'EntityDimension'].includes(dimType);
        }
        return dimType === objectType;
      })
      .map(dim => ({
        filePath: dim.path,
        objectType: this.mapKindToObjectType(dim.kind),
        objectName: dim.name,
        modelName: dim.modelName,
      }));
  }

  private findSpecificMatch(
    intent: string,
    matches: FileLocationMatch[]
  ): FileLocationMatch | null {
    for (const match of matches) {
      if (intent.includes(match.objectName.toLowerCase())) {
        return match;
      }
    }
    return null;
  }

  private findFuzzyMatches(
    intent: string,
    packageAnalysis: PackageAnalysisData
  ): FileLocationMatch[] {
    const words = intent.split(/\s+/).filter(w => w.length > 2);
    const matches: FileLocationMatch[] = [];

    for (const dim of packageAnalysis.dimensions) {
      const dimName = dim.name.toLowerCase();
      if (words.some(word => dimName.includes(word) || word.includes(dimName))) {
        matches.push({
          filePath: dim.path,
          objectType: this.mapKindToObjectType(dim.kind),
          objectName: dim.name,
          modelName: dim.modelName,
        });
      }
    }

    for (const cube of packageAnalysis.cubes) {
      const cubeName = cube.name.toLowerCase();
      if (words.some(word => cubeName.includes(word) || word.includes(cubeName))) {
        matches.push({
          filePath: cube.path,
          objectType: 'Cube',
          objectName: cube.name,
        });
      }
    }

    return matches;
  }

  private mapKindToObjectType(kind: string): PretObjectTypeName {
    const mapping: Record<string, PretObjectTypeName> = {
      'AccountDimension': 'AccountDimension',
      'TimeDimension': 'TimeDimension',
      'VersionDimension': 'VersionDimension',
      'CurrencyDimension': 'CurrencyDimension',
      'EntityDimension': 'EntityDimension',
      'OtherDimension': 'OtherDimension',
      'GenericDimension': 'GenericDimension',
    };
    return mapping[kind] || 'OtherDimension';
  }

  private buildClarificationMessage(
    matches: FileLocationMatch[],
    objectType?: PretObjectTypeName
  ): string {
    const typeStr = objectType ? ` ${objectType}` : '';
    const options = matches
      .map((m, i) => `${i + 1}. **${m.objectName}**${m.modelName ? ` (in ${m.modelName})` : ''}`)
      .join('\n');
    return `I found multiple${typeStr} files. Which one would you like to work with?\n${options}`;
  }

  locateAllForModel(
    modelName: string,
    packageAnalysis: PackageAnalysisData
  ): MultiFileLocationResult {
    const normalizedModelName = modelName.toLowerCase().trim();
    
    const matchingDimensions = packageAnalysis.dimensions.filter(dim => {
      const dimModelName = dim.modelName?.toLowerCase().trim();
      return dimModelName === normalizedModelName || 
             dimModelName?.includes(normalizedModelName) ||
             normalizedModelName.includes(dimModelName || '');
    });

    if (matchingDimensions.length === 0) {
      return {
        found: false,
        files: [],
        modelName,
        error: `No dimensions found for model "${modelName}".`,
      };
    }

    const files: FileLocationMatch[] = matchingDimensions.map(dim => ({
      filePath: dim.path,
      objectType: this.mapKindToObjectType(dim.kind),
      objectName: dim.name,
      modelName: dim.modelName,
    }));

    return {
      found: true,
      files,
      modelName,
    };
  }
}
