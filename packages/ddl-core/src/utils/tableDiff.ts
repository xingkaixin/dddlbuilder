import {
  type PersistedState,
  type NormalizedField,
  type IndexDefinition,
  type FieldRow,
  type TableMiscConfig,
  type ForeignKeyDefinition,
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
} from '@ddlbuilder/shared-types';

/**
 * 字段变更类型
 */
export type FieldDiffType = 'add' | 'remove' | 'modify' | 'rename';

/**
 * 字段属性变更类型
 */
export type FieldChangeType = 'type' | 'nullable' | 'default' | 'comment';

/**
 * 字段变更详情
 */
export type FieldDiff = {
  type: FieldDiffType;
  fieldName: string;
  oldField?: NormalizedField;
  newField?: NormalizedField;
  changes?: FieldChangeType[];
  // 仅用于 rename 类型
  oldFieldName?: string;
  newFieldName?: string;
};

/**
 * 索引变更类型
 */
export type IndexDiffType = 'add' | 'remove';

/**
 * 索引变更详情
 */
export type IndexDiff = {
  type: IndexDiffType;
  index: IndexDefinition;
};

/**
 * 外键变更类型
 */
export type ForeignKeyDiffType = 'add' | 'remove';

/**
 * 外键变更详情
 */
export type ForeignKeyDiff = {
  type: ForeignKeyDiffType;
  foreignKey: ForeignKeyDefinition;
};

/**
 * 表结构变更汇总
 */
export type TableDiff = {
  hasChanges: boolean;
  tableNameChanged: boolean;
  oldTableName?: string;
  newTableName?: string;
  tableCommentChanged: boolean;
  oldTableComment?: string;
  newTableComment?: string;
  miscConfigChanged: boolean;
  oldMiscConfig?: TableMiscConfig;
  newMiscConfig?: TableMiscConfig;
  fields: FieldDiff[];
  indexes: IndexDiff[];
  foreignKeys: ForeignKeyDiff[];
};

/**
 * 将 FieldRow 转换为 NormalizedField
 *
 * 作为共享包不能假设调用方已把历史中文枚举值归一化，这里重新收敛一次。
 */
function normalizeFieldRow(row: FieldRow): NormalizedField | null {
  const name = row.fieldName?.trim();
  if (!name) return null;

  return {
    name,
    type: row.fieldType?.trim() || '',
    comment: row.fieldComment?.trim() || '',
    nullable: normalizeFieldNullable(row.nullable),
    defaultKind: normalizeFieldDefaultKind(row.defaultKind),
    defaultValue: row.defaultValue?.trim() || '',
    onUpdate: normalizeFieldOnUpdate(row.onUpdate),
  };
}

/**
 * 从 PersistedState 中提取有效字段列表
 */
function extractFields(state: PersistedState): NormalizedField[] {
  if (!state.rows) return [];
  return state.rows.map(normalizeFieldRow).filter((f): f is NormalizedField => f !== null);
}

/**
 * 比较两个字段是否相同
 */
function fieldsEqual(a: NormalizedField, b: NormalizedField): boolean {
  return (
    a.type === b.type &&
    a.nullable === b.nullable &&
    a.defaultKind === b.defaultKind &&
    a.defaultValue === b.defaultValue &&
    a.onUpdate === b.onUpdate &&
    a.comment === b.comment
  );
}

function getFieldRenameSignature(field: NormalizedField): string {
  return JSON.stringify([field.type, field.comment]);
}

/**
 * 获取两个字段之间的差异
 */
function getFieldChanges(oldField: NormalizedField, newField: NormalizedField): FieldChangeType[] {
  const changes: FieldChangeType[] = [];

  if (oldField.type !== newField.type) {
    changes.push('type');
  }
  if (oldField.nullable !== newField.nullable) {
    changes.push('nullable');
  }
  if (
    oldField.defaultKind !== newField.defaultKind ||
    oldField.defaultValue !== newField.defaultValue ||
    oldField.onUpdate !== newField.onUpdate
  ) {
    changes.push('default');
  }
  if (oldField.comment !== newField.comment) {
    changes.push('comment');
  }

  return changes;
}

/**
 * 生成索引的唯一标识（用于比较）
 */
function getIndexSignature(index: IndexDefinition): string {
  const fieldsSig = index.fields.map((f) => `${f.name}:${f.direction}`).join(',');
  const prefix = index.isPrimary ? 'PK' : index.unique ? 'UQ' : 'IX';
  return `${prefix}:${index.name}:${fieldsSig}`;
}

/**
 * 对比两个 PersistedState，生成变更详情
 */
export function diffPersistedState(oldState: PersistedState, newState: PersistedState): TableDiff {
  const result: TableDiff = {
    hasChanges: false,
    tableNameChanged: false,
    tableCommentChanged: false,
    miscConfigChanged: false,
    fields: [],
    indexes: [],
    foreignKeys: [],
  };

  // 1. 表名变更
  const oldTableName = oldState.tableName?.trim() || '';
  const newTableName = newState.tableName?.trim() || '';
  if (oldTableName !== newTableName) {
    result.tableNameChanged = true;
    result.oldTableName = oldTableName;
    result.newTableName = newTableName;
    result.hasChanges = true;
  }

  // 2. 表注释变更
  const oldTableComment = oldState.tableComment?.trim() || '';
  const newTableComment = newState.tableComment?.trim() || '';
  if (oldTableComment !== newTableComment) {
    result.tableCommentChanged = true;
    result.oldTableComment = oldTableComment;
    result.newTableComment = newTableComment;
    result.hasChanges = true;
  }

  // 2.5 杂项设置变更
  type NormalizedMiscConfig = TableMiscConfig &
    Required<Pick<TableMiscConfig, 'enabled' | 'engine' | 'charset' | 'collation' | 'tablespace'>>;

  const normalizeMiscConfig = (config?: TableMiscConfig): NormalizedMiscConfig => {
    const normalized: NormalizedMiscConfig = {
      enabled: false,
      engine: '',
      charset: '',
      collation: '',
      tablespace: '',
      ...config,
    };
    if (!normalized.enabled) {
      return {
        ...normalized,
        engine: '',
        charset: '',
        collation: '',
        tablespace: '',
      };
    }
    return normalized;
  };

  const oldMiscConfig = normalizeMiscConfig(oldState.tableMiscConfig);
  const newMiscConfig = normalizeMiscConfig(newState.tableMiscConfig);
  if (
    oldMiscConfig.enabled !== newMiscConfig.enabled ||
    oldMiscConfig.engine !== newMiscConfig.engine ||
    oldMiscConfig.charset !== newMiscConfig.charset ||
    oldMiscConfig.collation !== newMiscConfig.collation ||
    oldMiscConfig.tablespace !== newMiscConfig.tablespace ||
    oldMiscConfig.fillfactor !== newMiscConfig.fillfactor ||
    oldMiscConfig.pctfree !== newMiscConfig.pctfree ||
    oldMiscConfig.initrans !== newMiscConfig.initrans
  ) {
    result.miscConfigChanged = true;
    result.oldMiscConfig = oldMiscConfig;
    result.newMiscConfig = newMiscConfig;
    result.hasChanges = true;
  }

  // 3. 字段变更
  const oldFields = extractFields(oldState);
  const newFields = extractFields(newState);

  const oldFieldMap = new Map<string, NormalizedField>();
  for (const f of oldFields) {
    oldFieldMap.set(f.name.toLowerCase(), f);
  }

  const newFieldMap = new Map<string, NormalizedField>();
  for (const f of newFields) {
    newFieldMap.set(f.name.toLowerCase(), f);
  }

  // 检测删除和修改的字段
  for (const [key, oldField] of oldFieldMap) {
    const newField = newFieldMap.get(key);
    if (!newField) {
      // 字段被删除
      result.fields.push({
        type: 'remove',
        fieldName: oldField.name,
        oldField,
      });
      result.hasChanges = true;
    } else if (!fieldsEqual(oldField, newField)) {
      // 字段被修改
      result.fields.push({
        type: 'modify',
        fieldName: newField.name,
        oldField,
        newField,
        changes: getFieldChanges(oldField, newField),
      });
      result.hasChanges = true;
    }
  }

  // 检测新增的字段
  for (const [key, newField] of newFieldMap) {
    if (!oldFieldMap.has(key)) {
      result.fields.push({
        type: 'add',
        fieldName: newField.name,
        newField,
      });
      result.hasChanges = true;
    }
  }

  // 5. 重命名检测：仅将结构签名唯一的 remove + add 合并为 rename
  const removedFields = result.fields.filter((f) => f.type === 'remove');
  const addedFields = result.fields.filter((f) => f.type === 'add');
  const removedByStructure = new Map<string, FieldDiff[]>();
  const addedByStructure = new Map<string, FieldDiff[]>();
  for (const field of removedFields) {
    if (!field.oldField) continue;
    const signature = getFieldRenameSignature(field.oldField);
    removedByStructure.set(signature, [...(removedByStructure.get(signature) ?? []), field]);
  }
  for (const field of addedFields) {
    if (!field.newField) continue;
    const signature = getFieldRenameSignature(field.newField);
    addedByStructure.set(signature, [...(addedByStructure.get(signature) ?? []), field]);
  }

  const renamedFields = new Set<FieldDiff>();
  const renames: FieldDiff[] = [];
  for (const [signature, removed] of removedByStructure) {
    const added = addedByStructure.get(signature);
    if (removed.length !== 1 || added?.length !== 1) continue;
    const oldField = removed[0].oldField;
    const newField = added[0].newField;
    if (!oldField || !newField) continue;
    renamedFields.add(removed[0]);
    renamedFields.add(added[0]);
    renames.push({
      type: 'rename',
      fieldName: newField.name,
      oldField,
      newField,
      oldFieldName: oldField.name,
      newFieldName: newField.name,
      changes: (() => {
        const changes = getFieldChanges(oldField, newField);
        return changes.length > 0 ? changes : undefined;
      })(),
    });
  }
  result.fields = [...result.fields.filter((field) => !renamedFields.has(field)), ...renames];

  // 4. 索引变更
  const oldIndexes = oldState.indexes || [];
  const newIndexes = newState.indexes || [];

  const oldIndexSigs = new Map<string, IndexDefinition>();
  for (const idx of oldIndexes) {
    oldIndexSigs.set(getIndexSignature(idx), idx);
  }

  const newIndexSigs = new Map<string, IndexDefinition>();
  for (const idx of newIndexes) {
    newIndexSigs.set(getIndexSignature(idx), idx);
  }

  // 检测删除的索引
  for (const [sig, idx] of oldIndexSigs) {
    if (!newIndexSigs.has(sig)) {
      result.indexes.push({ type: 'remove', index: idx });
      result.hasChanges = true;
    }
  }

  // 检测新增的索引
  for (const [sig, idx] of newIndexSigs) {
    if (!oldIndexSigs.has(sig)) {
      result.indexes.push({ type: 'add', index: idx });
      result.hasChanges = true;
    }
  }

  // 5. 外键变更
  const oldForeignKeys = oldState.foreignKeys || [];
  const newForeignKeys = newState.foreignKeys || [];

  function getForeignKeySignature(fk: ForeignKeyDefinition): string {
    const fieldsSig = fk.fields.join(',');
    const refSig = `${fk.refSchema || ''}.${fk.refTable}(${fk.refFields.join(',')})`;
    const actionSig = `${fk.onDelete || ''}|${fk.onUpdate || ''}`;
    return `${fk.name}:${fieldsSig}:${refSig}:${actionSig}`;
  }

  const oldFkSigs = new Map<string, ForeignKeyDefinition>();
  for (const fk of oldForeignKeys) {
    oldFkSigs.set(getForeignKeySignature(fk), fk);
  }

  const newFkSigs = new Map<string, ForeignKeyDefinition>();
  for (const fk of newForeignKeys) {
    newFkSigs.set(getForeignKeySignature(fk), fk);
  }

  // 检测删除的外键
  for (const [sig, fk] of oldFkSigs) {
    if (!newFkSigs.has(sig)) {
      result.foreignKeys.push({ type: 'remove', foreignKey: fk });
      result.hasChanges = true;
    }
  }

  // 检测新增的外键
  for (const [sig, fk] of newFkSigs) {
    if (!oldFkSigs.has(sig)) {
      result.foreignKeys.push({ type: 'add', foreignKey: fk });
      result.hasChanges = true;
    }
  }

  return result;
}
