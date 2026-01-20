import type { DimensionMember } from '../value-objects/DimensionMember';

export interface IDimensionMemberReader {
  readMembersFromPackage(
    zipFilePath: string,
    dimensionPath: string
  ): Promise<DimensionMember[]>;

  readMembersFromContent(
    content: Buffer | string
  ): Promise<DimensionMember[]>;
}
