import yaml from 'js-yaml';
import type { IDimensionMemberReader } from '../../../domain/pret/interfaces/IDimensionMemberReader';
import type { IPackageAnalyzer } from '../../../domain/pret/interfaces/IPackageAnalyzer';
import { DimensionMember } from '../../../domain/pret/value-objects/DimensionMember';

interface DimensionYamlDocument {
  spec?: {
    members?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export class YamlDimensionMemberReader implements IDimensionMemberReader {
  constructor(private readonly analyzer: IPackageAnalyzer) {}

  async readMembersFromPackage(
    zipFilePath: string,
    dimensionPath: string
  ): Promise<DimensionMember[]> {
    const content = await this.analyzer.extractFileFromZip(zipFilePath, dimensionPath);
    return this.readMembersFromContent(content);
  }

  async readMembersFromContent(
    content: Buffer | string
  ): Promise<DimensionMember[]> {
    const yamlContent = typeof content === 'string' ? content : content.toString('utf-8');

    try {
      const doc = yaml.load(yamlContent) as DimensionYamlDocument;

      if (!doc?.spec?.members || !Array.isArray(doc.spec.members)) {
        return [];
      }

      return doc.spec.members
        .filter((m): m is Record<string, unknown> => m !== null && typeof m === 'object')
        .map(m => DimensionMember.fromYaml(m));
    } catch (error) {
      console.error(`Failed to parse dimension YAML:`, error);
      return [];
    }
  }
}
