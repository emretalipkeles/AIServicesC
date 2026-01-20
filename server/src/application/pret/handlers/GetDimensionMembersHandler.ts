import type { GetDimensionMembersQuery } from '../queries/GetDimensionMembersQuery';
import type { IDimensionMemberReader } from '../../../domain/pret/interfaces/IDimensionMemberReader';
import type { IPretPackageStorage } from '../../../domain/pret/interfaces/IPretPackageStorage';
import type { DimensionMembersDto, MemberNodeDto } from '../dto/DimensionMembersDto';
import type { DimensionMember } from '../../../domain/pret/value-objects/DimensionMember';

export class GetDimensionMembersHandler {
  constructor(
    private readonly storage: IPretPackageStorage,
    private readonly memberReader: IDimensionMemberReader
  ) {}

  async handle(query: GetDimensionMembersQuery): Promise<DimensionMembersDto> {
    // Read from extracted S3 files (not original ZIP) to get latest content including newly created dimensions
    const content = await this.storage.getFileContent(
      query.tenantId,
      query.packageId,
      query.dimensionPath
    );

    const members = await this.memberReader.readMembersFromContent(content);
    const tree = this.buildTree(members);

    return {
      dimensionPath: query.dimensionPath,
      totalMembers: members.length,
      tree,
    };
  }

  private buildTree(members: DimensionMember[]): MemberNodeDto[] {
    const memberMap = new Map<string, MemberNodeDto>();

    for (const member of members) {
      memberMap.set(member.key, {
        key: member.key,
        name: member.name,
        parent: member.parent,
        properties: {
          rollUp: member.properties.rollUp,
          accountType: member.properties.accountType,
          calculationMethod: member.properties.calculationMethod,
          debitCredit: member.properties.debitCredit,
          numericFormat: member.properties.numericFormat,
          timeConversionMethod: member.properties.timeConversionMethod,
          currencyConversionMethod: member.properties.currencyConversionMethod,
          hasCalculations: Array.isArray(member.properties.calculations) && member.properties.calculations.length > 0,
          note: member.properties.note,
        },
        children: [],
      });
    }

    const roots: MemberNodeDto[] = [];
    const nodes = Array.from(memberMap.values());

    for (const node of nodes) {
      if (node.parent === node.key || !node.parent) {
        roots.push(node);
      } else {
        const parentNode = memberMap.get(node.parent);
        if (parentNode) {
          parentNode.children.push(node);
        } else {
          roots.push(node);
        }
      }
    }

    return roots;
  }
}
