export interface MemberPropertiesDto {
  rollUp?: string;
  accountType?: string;
  calculationMethod?: string;
  debitCredit?: string;
  numericFormat?: string;
  timeConversionMethod?: string;
  currencyConversionMethod?: string;
  hasCalculations: boolean;
  note?: string;
}

export interface MemberNodeDto {
  key: string;
  name: string;
  parent: string;
  properties: MemberPropertiesDto;
  children: MemberNodeDto[];
}

export interface DimensionMembersDto {
  dimensionPath: string;
  totalMembers: number;
  tree: MemberNodeDto[];
}
