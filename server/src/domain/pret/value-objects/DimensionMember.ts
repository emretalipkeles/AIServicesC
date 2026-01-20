export interface DimensionMemberProperties {
  key: string;
  name: string;
  parent: string;
  rollUp?: string;
  accountType?: string;
  calculationMethod?: string;
  debitCredit?: string;
  numericFormat?: string;
  timeConversionMethod?: string;
  currencyConversionMethod?: string;
  calculations?: Array<{ type: string }>;
  note?: string;
}

export class DimensionMember {
  constructor(
    public readonly key: string,
    public readonly name: string,
    public readonly parent: string,
    public readonly properties: Omit<DimensionMemberProperties, 'key' | 'name' | 'parent'>
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.key || typeof this.key !== 'string') {
      throw new Error('DimensionMember key is required and must be a string');
    }
    if (!this.name || typeof this.name !== 'string') {
      throw new Error('DimensionMember name is required and must be a string');
    }
  }

  isRoot(): boolean {
    return this.parent === this.key || !this.parent;
  }

  static fromYaml(data: Record<string, unknown>): DimensionMember {
    const key = String(data.key ?? '');
    const name = String(data.name ?? key);
    const parent = String(data.parent ?? key);

    return new DimensionMember(key, name, parent, {
      rollUp: data.rollUp as string | undefined,
      accountType: data.accountType as string | undefined,
      calculationMethod: data.calculationMethod as string | undefined,
      debitCredit: data.debitCredit as string | undefined,
      numericFormat: data.numericFormat as string | undefined,
      timeConversionMethod: data.timeConversionMethod as string | undefined,
      currencyConversionMethod: data.currencyConversionMethod as string | undefined,
      calculations: data.calculations as Array<{ type: string }> | undefined,
      note: data.note as string | undefined,
    });
  }
}
