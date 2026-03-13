export interface IFieldMemoContextProvider {
  getConsolidatedContext(
    projectId: string,
    tenantId: string,
    filterMonth?: number,
    filterYear?: number
  ): Promise<string | null>;
}
