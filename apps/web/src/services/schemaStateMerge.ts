import type { FieldRow, PersistedState } from '@ddlbuilder/shared-types';
import { stableStringify } from '@ddlbuilder/workspace-core';
import { removeFieldsFromDocument, updateDocumentFields } from '@/stores/editorDocumentMutations';

const SCALAR_MERGE_KEYS = [
  'schemaName',
  'tableName',
  'tableComment',
  'objectType',
  'viewDefinition',
  'viewCreateOrReplace',
  'dbType',
  'indexes',
  'foreignKeys',
  'citusShardingConfig',
  'mysqlPartitionConfig',
  'tableMiscConfig',
  'authInput',
  'authObjects',
] as const satisfies readonly (keyof PersistedState)[];

const ROW_MERGE_KEYS = [
  'fieldName',
  'fieldType',
  'fieldComment',
  'nullable',
  'defaultKind',
  'defaultValue',
  'onUpdate',
  'enumMeta',
] as const satisfies readonly (keyof FieldRow)[];

/** 本地改过、远端没动的键归本地；两边都改则让远端赢，与 Y.Doc 的收敛方向一致。 */
const pickLocalEdits = <T>(base: T, local: T, remote: T, keys: readonly (keyof T)[]) => {
  const picked: Partial<T> = {};
  for (const key of keys) {
    const baseValue = stableStringify(base[key]);
    if (baseValue === stableStringify(local[key])) continue;
    if (baseValue !== stableStringify(remote[key])) continue;
    picked[key] = local[key];
  }
  return picked;
};

const rowIds = (rows: FieldRow[]) => rows.map((row) => row.id);

const hasReorderedBaseRows = (baseRows: FieldRow[], candidateRows: FieldRow[]) => {
  const baseIds = rowIds(baseRows);
  const baseIdSet = new Set(baseIds);
  const candidateIds = rowIds(candidateRows);
  const candidateIdSet = new Set(candidateIds);
  const expectedOrder = baseIds.filter((id) => candidateIdSet.has(id));
  const candidateOrder = candidateIds.filter((id) => baseIdSet.has(id));
  return stableStringify(expectedOrder) !== stableStringify(candidateOrder);
};

const mergeRowOrder = (
  primaryRows: FieldRow[],
  secondaryRows: FieldRow[],
  resolvedRows: ReadonlyMap<string, FieldRow>,
) => {
  const order = rowIds(primaryRows).filter((id) => resolvedRows.has(id));
  const secondaryOrder = rowIds(secondaryRows).filter((id) => resolvedRows.has(id));

  secondaryOrder.forEach((id, index) => {
    if (order.includes(id)) return;

    let previousId: string | undefined;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = secondaryOrder[cursor];
      if (candidate && order.includes(candidate)) {
        previousId = candidate;
        break;
      }
    }
    if (previousId) {
      order.splice(order.indexOf(previousId) + 1, 0, id);
      return;
    }

    const nextId = secondaryOrder.slice(index + 1).find((candidate) => order.includes(candidate));
    if (nextId) {
      order.splice(order.indexOf(nextId), 0, id);
      return;
    }

    order.push(id);
  });

  return order;
};

const resolveRows = (baseRows: FieldRow[], localRows: FieldRow[], remoteRows: FieldRow[]) => {
  const baseById = new Map(baseRows.map((row) => [row.id, row]));
  const localById = new Map(localRows.map((row) => [row.id, row]));
  const remoteById = new Map(remoteRows.map((row) => [row.id, row]));
  const ids = new Set([...baseById.keys(), ...localById.keys(), ...remoteById.keys()]);
  const resolvedRows = new Map<string, FieldRow>();

  for (const id of ids) {
    const baseRow = baseById.get(id);
    const localRow = localById.get(id);
    const remoteRow = remoteById.get(id);

    if (!baseRow) {
      const addedRow = remoteRow ?? localRow;
      if (addedRow) resolvedRows.set(id, addedRow);
      continue;
    }
    if (!remoteRow) continue;
    if (!localRow) {
      if (stableStringify(baseRow) !== stableStringify(remoteRow)) {
        resolvedRows.set(id, remoteRow);
      }
      continue;
    }

    resolvedRows.set(id, {
      ...remoteRow,
      ...pickLocalEdits(baseRow, localRow, remoteRow, ROW_MERGE_KEYS),
    });
  }

  const localOrderWins =
    hasReorderedBaseRows(baseRows, localRows) && !hasReorderedBaseRows(baseRows, remoteRows);
  const order = localOrderWins
    ? mergeRowOrder(localRows, remoteRows, resolvedRows)
    : mergeRowOrder(remoteRows, localRows, resolvedRows);
  return order.flatMap((id) => {
    const row = resolvedRows.get(id);
    return row ? [row] : [];
  });
};

/** 合并双方相对基线的修改，冲突由 preferredState 决定；行按稳定 id 对齐。 */
export const mergeSchemaStates = (
  baseState: PersistedState,
  otherState: PersistedState,
  preferredState: PersistedState,
): PersistedState => {
  const rows = resolveRows(baseState.rows, otherState.rows, preferredState.rows);
  const resolvedIds = new Set(rowIds(rows));
  const alignFieldReferences = (state: PersistedState) => {
    const isRemoved = (row: FieldRow) => !resolvedIds.has(row.id);
    const retained = state.rows.some(isRemoved)
      ? removeFieldsFromDocument(state, isRemoved)
      : state;
    return updateDocumentFields(retained, rows);
  };

  // 先对齐引用再比较结构变化，字段改名本身不应与另一端新增索引产生冲突。
  const base = alignFieldReferences(baseState);
  const other = alignFieldReferences(otherState);
  const preferred = alignFieldReferences(preferredState);
  return {
    ...preferred,
    ...pickLocalEdits(base, other, preferred, SCALAR_MERGE_KEYS),
    rows,
  };
};
