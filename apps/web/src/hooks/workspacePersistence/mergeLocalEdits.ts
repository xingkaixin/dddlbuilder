import type { FieldRow, PersistedState } from '@ddlbuilder/shared-types';
import { stableStringify } from '@ddlbuilder/workspace-core';

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

/**
 * Y.Doc 就绪之前的本地编辑没进过文档，远端刷新回来时只能靠 base→local 的差异补回。
 * 行按 id 对齐——按下标对齐会在任一端增删行后把改动记到别的字段上。
 */
export const mergeLocalDraftChanges = (
  baseState: PersistedState,
  localState: PersistedState,
  remoteState: PersistedState,
): PersistedState => {
  const baseRows = new Map(baseState.rows.map((row) => [row.id, row]));
  const localRows = new Map(localState.rows.map((row) => [row.id, row]));

  return {
    ...remoteState,
    ...pickLocalEdits(baseState, localState, remoteState, SCALAR_MERGE_KEYS),
    rows: remoteState.rows.map((remoteRow) => {
      const baseRow = baseRows.get(remoteRow.id);
      const localRow = localRows.get(remoteRow.id);
      if (!baseRow || !localRow) return remoteRow;
      return { ...remoteRow, ...pickLocalEdits(baseRow, localRow, remoteRow, ROW_MERGE_KEYS) };
    }),
  };
};
