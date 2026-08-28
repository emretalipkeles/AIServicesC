export interface XerIdentityDefinition {
  fields: readonly string[];
  fallbackFields?: readonly string[];
}

export const XER_IDENTITY_REGISTRY: Readonly<Record<string, XerIdentityDefinition>> = {
  PROJECT: { fields: ["proj_id"] },
  TASK: { fields: ["task_id"] },
  CALENDAR: { fields: ["clndr_id"] },
  RSRC: { fields: ["rsrc_id"] },
  ACCOUNT: { fields: ["acct_id"] },
  PROJWBS: { fields: ["wbs_id"] },
  TASKPRED: { fields: ["task_pred_id"], fallbackFields: ["pred_task_id", "task_id", "pred_type"] },
  TASKRSRC: { fields: ["taskrsrc_id"] },
};

export interface IdentityResult {
  key: string;
  fields: string[];
  position: number;
}

export function identityForRow(
  tableName: string,
  fields: string[],
  values: string[],
  position: number,
): IdentityResult | null {
  const definition = XER_IDENTITY_REGISTRY[tableName];
  if (!definition) return null;
  const primaryIndexes = definition.fields.map((field) => fields.indexOf(field));
  const hasPrimary = primaryIndexes.every((index) => index >= 0);
  const identityFields = hasPrimary ? definition.fields : definition.fallbackFields;
  if (!identityFields) return null;
  const indexes = identityFields.map((field) => fields.indexOf(field));
  if (indexes.some((index) => index < 0)) return null;
  return {
    key: identityFields.map((_, index) => values[indexes[index]] ?? "").join("\u001f"),
    fields: [...identityFields],
    position,
  };
}

export function duplicateIdentities(tableName: string, fields: string[], rows: { values?: string[] }[]): {
  key: string;
  positions: number[];
  identityFields: string[];
}[] {
  const byKey = new Map<string, { positions: number[]; identityFields: string[] }>();
  rows.forEach((row, index) => {
    const identity = identityForRow(tableName, fields, row.values ?? [], index + 1);
    if (!identity) return;
    const existing = byKey.get(identity.key) ?? { positions: [], identityFields: identity.fields };
    existing.positions.push(identity.position);
    byKey.set(identity.key, existing);
  });
  return Array.from(byKey.entries())
    .filter(([, value]) => value.positions.length > 1)
    .map(([key, value]) => ({ key, ...value }));
}
