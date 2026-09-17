import { decodeSchemaSnapshotEnvelope, type StandardSummary } from '@ddlbuilder/shared-types/api';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { decodePersistedState } from './persistedStateCodec.js';

export type DeliverySnapshot = { tables: PersistedState[]; standards: StandardSummary[] };

// Delivery files must not lose supplied properties while the compatibility decoder fills omitted defaults.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type
function assertPreserved(source: unknown, decoded: unknown, path: string): void {
  if (source === undefined) return;

  if (Array.isArray(source)) {
    if (!Array.isArray(decoded) || source.length !== decoded.length)
      throw new Error(`Invalid snapshot at ${path}`);
    source.forEach((value, index) => assertPreserved(value, decoded[index], `${path}[${index}]`));
  } else if (source !== null && typeof source === 'object') {
    if (decoded === null || typeof decoded !== 'object')
      throw new Error(`Invalid snapshot at ${path}`);
    // SAFETY: decoded is an object, and each source property is checked recursively before use.
    const record = decoded as Record<string, unknown>;

    for (const [key, value] of Object.entries(source))
      assertPreserved(value, record[key], `${path}.${key}`);
  } else if (source !== decoded) throw new Error(`Invalid snapshot at ${path}`);
}
// oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type

export function decodeDeliveryTables(values: readonly unknown[]): PersistedState[] {
  if (values.length > 200) throw new Error('A snapshot supports at most 200 tables');
  const identities = new Set<string>();
  let fields = 0;

  return values.map((value) => {
    const table = decodePersistedState(value, 'external');

    if (!table || !table.tableName.trim()) throw new Error('Invalid table snapshot');
    assertPreserved(value, table, table.tableName);
    const identity = JSON.stringify([table.dbType, table.schemaName, table.tableName]);

    if (identities.has(identity)) throw new Error(`Duplicate table: ${table.tableName}`);
    identities.add(identity);
    fields += table.rows.length;

    if (fields > 10000) throw new Error('A snapshot supports at most 10000 fields');

    return table;
  });
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- uploaded snapshots enter through this decoder.
export function decodeDeliverySnapshot(value: unknown): DeliverySnapshot {
  const snapshot = decodeSchemaSnapshotEnvelope(value);

  const ids = new Set(snapshot.standards.map((standard) => standard.id));

  if (ids.size !== snapshot.standards.length || ids.has(''))
    throw new Error('Invalid standard identity');

  return { tables: decodeDeliveryTables(snapshot.tables), standards: [...snapshot.standards] };
}

export function encodeDeliverySnapshot(snapshot: DeliverySnapshot): string {
  return JSON.stringify({ format: 'ddlbuilder-schema', version: 1, ...snapshot }, null, 2);
}
