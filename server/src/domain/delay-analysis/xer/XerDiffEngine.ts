import { XerDocument, XerTable } from "./XerTypes";
import { duplicateIdentities, identityForRow, XER_IDENTITY_REGISTRY } from "./XerIdentityRegistry";
import { sha256Hex } from "./XerHash";

export type XerDiffCategory =
  | "table_presence"
  | "table_order"
  | "field_list"
  | "field_order"
  | "row_count"
  | "row_value"
  | "row_order"
  | "duplicate_identity"
  | "row_identity_skipped"
  | "header_value"
  | "file_encoding"
  | "line_ending"
  | "raw_record"
  | "trailing_bytes"
  | "raw_bytes";

export interface XerDifference {
  category: XerDiffCategory;
  table?: string;
  identityKey?: string;
  field?: string;
  original?: unknown;
  generated?: unknown;
  message: string;
}

export interface XerDiffReport {
  byteIdentical: boolean;
  outcome: "clean" | "differences" | "incomplete";
  originalSha256: string;
  generatedSha256: string;
  differences: XerDifference[];
}

function tableMap(document: XerDocument): Map<string, XerTable> {
  return new Map(document.tables.map((table) => [table.name, table]));
}

function compareOrder(
  category: "table_order" | "field_order" | "row_order",
  table: string | undefined,
  original: unknown,
  generated: unknown,
): XerDifference {
  return {
    category,
    table,
    original,
    generated,
    message: `${category.replaceAll("_", " ")} changed${table ? ` for table "${table}"` : ""}`,
  };
}

function exactBytes(bytes: Buffer): { hex: string; length: number } {
  return { hex: bytes.toString("hex"), length: bytes.length };
}

function addLineEndingDifference(
  differences: XerDifference[],
  location: string,
  original: Buffer,
  generated: Buffer,
  table?: string,
): void {
  if (original.equals(generated)) return;
  differences.push({
    category: "line_ending",
    table,
    original: exactBytes(original),
    generated: exactBytes(generated),
    message: `Physical line ending differs at ${location}`,
  });
}

function addRawRecordDifference(
  differences: XerDifference[],
  location: string,
  original: Buffer,
  generated: Buffer,
  table?: string,
): void {
  if (original.equals(generated)) return;
  differences.push({
    category: "raw_record",
    table,
    original: exactBytes(original),
    generated: exactBytes(generated),
    message: `Raw record bytes differ at ${location} although parsed values are unchanged`,
  });
}

export function diffXer(
  original: XerDocument,
  generated: XerDocument,
  originalBytes: Buffer,
  generatedBytes: Buffer,
): XerDiffReport {
  if (originalBytes.equals(generatedBytes)) {
    const sha256 = sha256Hex(originalBytes);
    return {
      byteIdentical: true,
      outcome: "clean",
      originalSha256: sha256,
      generatedSha256: sha256,
      differences: [],
    };
  }
  const differences: XerDifference[] = [];
  const headerFieldCount = Math.max(original.headerFields.length, generated.headerFields.length);
  for (let index = 0; index < headerFieldCount; index += 1) {
    if (original.headerFields[index] !== generated.headerFields[index]) {
      differences.push({
        category: "header_value",
        field: `ERMHDR[${index}]`,
        original: original.headerFields[index],
        generated: generated.headerFields[index],
        message: `ERMHDR field ${index} differs`,
      });
    }
  }
  if (JSON.stringify(original.headerFields) === JSON.stringify(generated.headerFields)) {
    addRawRecordDifference(differences, "ERMHDR line", original.headerLine, generated.headerLine);
  }
  addLineEndingDifference(
    differences,
    "ERMHDR line",
    Buffer.from(original.lineEnding, "ascii"),
    Buffer.from(generated.lineEnding, "ascii"),
  );
  const originalTables = tableMap(original);
  const generatedTables = tableMap(generated);
  const originalNames = original.tables.map((table) => table.name);
  const generatedNames = generated.tables.map((table) => table.name);
  if (JSON.stringify(originalNames) !== JSON.stringify(generatedNames) &&
      new Set(originalNames).size === new Set(generatedNames).size &&
      originalNames.every((name) => generatedNames.includes(name))) {
    differences.push(compareOrder("table_order", undefined, originalNames, generatedNames));
  }
  for (const tableName of originalNames.filter((name) => !generatedTables.has(name))) {
    differences.push({ category: "table_presence", table: tableName, original: "present", generated: "absent", message: `Table "${tableName}" is present only in the original file` });
  }
  for (const tableName of generatedNames.filter((name) => !originalTables.has(name))) {
    differences.push({ category: "table_presence", table: tableName, original: "absent", generated: "present", message: `Table "${tableName}" is present only in the generated file` });
  }

  for (const tableName of originalNames.filter((name) => generatedTables.has(name))) {
    const before = originalTables.get(tableName)!;
    const after = generatedTables.get(tableName)!;
    addLineEndingDifference(
      differences,
      `%T for table "${tableName}"`,
      before.tableRecord.lineEnding,
      after.tableRecord.lineEnding,
      tableName,
    );
    addRawRecordDifference(
      differences,
      `%T for table "${tableName}"`,
      before.tableRecord.rawLine,
      after.tableRecord.rawLine,
      tableName,
    );
    if (before.fieldsRecord && after.fieldsRecord) {
      addLineEndingDifference(
        differences,
        `%F for table "${tableName}"`,
        before.fieldsRecord.lineEnding,
        after.fieldsRecord.lineEnding,
        tableName,
      );
      if (JSON.stringify(before.fields) === JSON.stringify(after.fields)) {
        addRawRecordDifference(
          differences,
          `%F for table "${tableName}"`,
          before.fieldsRecord.rawLine,
          after.fieldsRecord.rawLine,
          tableName,
        );
      }
    }
    const commonPhysicalRows = Math.min(before.rows.length, after.rows.length);
    for (let rowIndex = 0; rowIndex < commonPhysicalRows; rowIndex += 1) {
      const beforeRow = before.rows[rowIndex];
      const afterRow = after.rows[rowIndex];
      addLineEndingDifference(
        differences,
        `%R row position ${rowIndex + 1} in table "${tableName}"`,
        beforeRow.lineEnding,
        afterRow.lineEnding,
        tableName,
      );
      if (JSON.stringify(beforeRow.values) === JSON.stringify(afterRow.values)) {
        addRawRecordDifference(
          differences,
          `%R row position ${rowIndex + 1} in table "${tableName}"`,
          beforeRow.rawLine,
          afterRow.rawLine,
          tableName,
        );
      }
    }
    if (JSON.stringify(before.fields) !== JSON.stringify(after.fields)) {
      if (JSON.stringify([...before.fields].sort()) === JSON.stringify([...after.fields].sort())) {
        differences.push(compareOrder("field_order", tableName, before.fields, after.fields));
      } else {
        differences.push({
          category: "field_list",
          table: tableName,
          original: before.fields,
          generated: after.fields,
          message: `Field list differs in table "${tableName}"`,
        });
      }
    }
    if (before.rows.length !== after.rows.length) {
      differences.push({
        category: "row_count",
        table: tableName,
        original: before.rows.length,
        generated: after.rows.length,
        message: `Row count differs in table "${tableName}"`,
      });
    }

    const duplicates = [
      ...duplicateIdentities(tableName, before.fields, before.rows).map((item) => ({ side: "original", item })),
      ...duplicateIdentities(tableName, after.fields, after.rows).map((item) => ({ side: "generated", item })),
    ];
    for (const duplicate of duplicates) {
      differences.push({
        category: "duplicate_identity",
        table: tableName,
        identityKey: duplicate.item.key,
        original: duplicate.side,
        generated: duplicate.item.positions,
        message: `Duplicate identity key "${duplicate.item.key}" in table "${tableName}" using ${duplicate.item.identityFields.join(", ")} (${duplicate.side} row positions: ${duplicate.item.positions.join(", ")})`,
      });
    }

    const registry = XER_IDENTITY_REGISTRY[tableName];
    const originalHasDuplicates = duplicateIdentities(tableName, before.fields, before.rows).length > 0;
    const generatedHasDuplicates = duplicateIdentities(tableName, after.fields, after.rows).length > 0;
    const originalIdentityResolvable = Boolean(registry) && Boolean(
      identityForRow(tableName, before.fields, before.fields.map(() => ""), 1),
    );
    const generatedIdentityResolvable = Boolean(registry) && Boolean(
      identityForRow(tableName, after.fields, after.fields.map(() => ""), 1),
    );
    const identityUnavailable = !registry || !originalIdentityResolvable || !generatedIdentityResolvable;
    if (identityUnavailable) {
      differences.push({
        category: "row_identity_skipped",
        table: tableName,
        message: !registry
          ? `Row-identity analysis skipped for table "${tableName}" because no key is registered; rows are compared positionally`
          : `Row-identity analysis skipped for table "${tableName}" because its registered key fields are absent; rows are compared positionally`,
      });
    }
    const canMatchByIdentity =
      !identityUnavailable && !originalHasDuplicates && !generatedHasDuplicates;
    const originalIndex = new Map<string, { values: string[]; position: number }>();
    const generatedIndex = new Map<string, { values: string[]; position: number }>();
    if (canMatchByIdentity) {
      before.rows.forEach((row, index) => {
        const identity = identityForRow(tableName, before.fields, row.values ?? [], index + 1);
        if (identity) originalIndex.set(identity.key, { values: row.values ?? [], position: index + 1 });
      });
      after.rows.forEach((row, index) => {
        const identity = identityForRow(tableName, after.fields, row.values ?? [], index + 1);
        if (identity) generatedIndex.set(identity.key, { values: row.values ?? [], position: index + 1 });
      });
    }
    if (canMatchByIdentity && originalIndex.size === before.rows.length && generatedIndex.size === after.rows.length) {
      const originalSequence = before.rows.map((row, index) => identityForRow(tableName, before.fields, row.values ?? [], index + 1)!.key);
      const generatedSequence = after.rows.map((row, index) => identityForRow(tableName, after.fields, row.values ?? [], index + 1)!.key);
      if (JSON.stringify(originalSequence) !== JSON.stringify(generatedSequence) &&
          originalSequence.length === generatedSequence.length &&
          originalSequence.every((key) => generatedSequence.includes(key))) {
        differences.push(compareOrder("row_order", tableName, originalSequence, generatedSequence));
      }
      for (const key of Array.from(new Set([...Array.from(originalIndex.keys()), ...Array.from(generatedIndex.keys())]))) {
        const beforeRow = originalIndex.get(key);
        const afterRow = generatedIndex.get(key);
        if (!beforeRow || !afterRow) {
          differences.push({
            category: "row_value",
            table: tableName,
            identityKey: key,
            original: beforeRow?.values ?? "absent",
            generated: afterRow?.values ?? "absent",
            message: `Row "${key}" is present only on one side of table "${tableName}"`,
          });
          continue;
        }
        const fieldNames = new Set([...before.fields, ...after.fields]);
        for (const field of Array.from(fieldNames)) {
          const oldValue = beforeRow.values[before.fields.indexOf(field)];
          const newValue = afterRow.values[after.fields.indexOf(field)];
          if (oldValue !== newValue) {
            differences.push({
              category: "row_value",
              table: tableName,
              identityKey: key,
              field,
              original: oldValue,
              generated: newValue,
              message: `Value differs in ${tableName} row "${key}", field "${field}"`,
            });
          }
        }
      }
    } else if (identityUnavailable) {
      const count = Math.min(before.rows.length, after.rows.length);
      for (let rowIndex = 0; rowIndex < count; rowIndex += 1) {
        const oldValues = before.rows[rowIndex].values ?? [];
        const newValues = after.rows[rowIndex].values ?? [];
        for (let fieldIndex = 0; fieldIndex < Math.max(oldValues.length, newValues.length); fieldIndex += 1) {
          if (oldValues[fieldIndex] !== newValues[fieldIndex]) {
            differences.push({
              category: "row_value",
              table: tableName,
              identityKey: `position ${rowIndex + 1}`,
              field: before.fields[fieldIndex] ?? after.fields[fieldIndex],
              original: oldValues[fieldIndex],
              generated: newValues[fieldIndex],
              message: `Value differs in ${tableName} row position ${rowIndex + 1}`,
            });
          }
        }
      }
      for (let rowIndex = count; rowIndex < Math.max(before.rows.length, after.rows.length); rowIndex += 1) {
        const beforeRow = before.rows[rowIndex];
        const afterRow = after.rows[rowIndex];
        differences.push({
          category: "row_value",
          table: tableName,
          identityKey: `position ${rowIndex + 1}`,
          original: beforeRow?.values ?? "absent",
          generated: afterRow?.values ?? "absent",
          message: `Row position ${rowIndex + 1} is present only on one side of table "${tableName}"`,
        });
      }
    }
  }
  if (original.encoding !== generated.encoding) {
    differences.push({ category: "file_encoding", original: original.encoding, generated: generated.encoding, message: "File encoding differs" });
  }
  addLineEndingDifference(differences, "%E line", original.endLineEnding, generated.endLineEnding);
  if (!original.trailingBytes.equals(generated.trailingBytes)) {
    differences.push({
      category: "trailing_bytes",
      original: exactBytes(original.trailingBytes),
      generated: exactBytes(generated.trailingBytes),
      message: "Bytes following the %E record differ",
    });
  }
  const byteIdentical = originalBytes.equals(generatedBytes);
  if (!byteIdentical && differences.length === 0) {
    const commonLength = Math.min(originalBytes.length, generatedBytes.length);
    let offset = 0;
    while (offset < commonLength && originalBytes[offset] === generatedBytes[offset]) offset += 1;
    differences.push({
      category: "raw_bytes",
      original: { offset, byte: originalBytes[offset], fileLength: originalBytes.length },
      generated: { offset, byte: generatedBytes[offset], fileLength: generatedBytes.length },
      message: `Unclassified raw byte difference begins at byte offset ${offset}`,
    });
  }
  return {
    byteIdentical,
    outcome: differences.some((difference) => difference.category === "duplicate_identity") ? "incomplete" : byteIdentical && differences.length === 0 ? "clean" : "differences",
    originalSha256: sha256Hex(originalBytes),
    generatedSha256: sha256Hex(generatedBytes),
    differences,
  };
}
