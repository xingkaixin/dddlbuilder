import type {
  PersistedState,
  NormalizedField,
  IndexDefinition,
  FieldRow,
  TableMiscConfig,
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
};

/**
 * 将 FieldRow 转换为 NormalizedField
 */
function normalizeFieldRow(row: FieldRow): NormalizedField | null {
  const name = row.fieldName?.trim();
  if (!name) return null;

  const nullableStr = (row.nullable || '').toLowerCase();
  const nullable = ['是', 'y', 'yes', 'true', '1', '√'].includes(nullableStr);

  let defaultKind: NormalizedField['defaultKind'] = 'none';
  const defaultKindStr = (row.defaultKind || '').toLowerCase();
  if (defaultKindStr === '自增' || defaultKindStr === 'auto_increment') {
    defaultKind = 'auto_increment';
  } else if (defaultKindStr === '常量' || defaultKindStr === 'constant') {
    defaultKind = 'constant';
  } else if (defaultKindStr === '当前时间' || defaultKindStr === 'current_timestamp') {
    defaultKind = 'current_timestamp';
  } else if (defaultKindStr === 'uuid') {
    defaultKind = 'uuid';
  }

  let onUpdate: NormalizedField['onUpdate'] = 'none';
  const onUpdateStr = (row.onUpdate || '').toLowerCase();
  if (onUpdateStr === '当前时间' || onUpdateStr === 'current_timestamp') {
    onUpdate = 'current_timestamp';
  }

  return {
    name,
    type: row.fieldType?.trim() || '',
    comment: row.fieldComment?.trim() || '',
    nullable,
    defaultKind,
    defaultValue: row.defaultValue?.trim() || '',
    onUpdate,
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
  return `${prefix}:${fieldsSig}`;
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
  const normalizeMiscConfig = (config?: TableMiscConfig): Required<TableMiscConfig> => {
    const normalized: Required<TableMiscConfig> = {
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
    oldMiscConfig.tablespace !== newMiscConfig.tablespace
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

  // 5. 重命名检测：将匹配的 remove + add 合并为 rename
  // 规则：相同类型 + 相同注释 视为重命名
  const removedFields = result.fields.filter((f) => f.type === 'remove');
  const addedFields = result.fields.filter((f) => f.type === 'add');

  const renamedPairs: Array<{ removeIdx: number; addIdx: number }> = [];

  for (let i = 0; i < removedFields.length; i++) {
    const removed = removedFields[i];
    if (!removed.oldField) continue;

    for (let j = 0; j < addedFields.length; j++) {
      const added = addedFields[j];
      if (!added.newField) continue;

      // 检查是否已被配对
      if (renamedPairs.some((p) => p.addIdx === j)) continue;

      // 匹配规则：类型相同且注释相同
      if (
        removed.oldField.type === added.newField.type &&
        removed.oldField.comment === added.newField.comment
      ) {
        renamedPairs.push({ removeIdx: i, addIdx: j });
        break; // 每个 remove 只能配对一个 add
      }
    }
  }

  // 如果有重命名配对，需要更新 result.fields
  if (renamedPairs.length > 0) {
    const removeIndexes = new Set(
      renamedPairs.map((p) => result.fields.indexOf(removedFields[p.removeIdx])),
    );
    const addIndexes = new Set(
      renamedPairs.map((p) => result.fields.indexOf(addedFields[p.addIdx])),
    );

    // 过滤掉已配对的 add 和 remove
    const filteredFields = result.fields.filter(
      (_, idx) => !removeIndexes.has(idx) && !addIndexes.has(idx),
    );

    // 添加 rename 类型
    for (const pair of renamedPairs) {
      const removed = removedFields[pair.removeIdx];
      const added = addedFields[pair.addIdx];

      // 检查除了名称之外是否有其他变更
      const changes =
        removed.oldField && added.newField
          ? getFieldChanges(removed.oldField, added.newField).filter(
              (c) => c !== 'comment', // 注释相同是匹配条件，不算变更
            )
          : [];

      filteredFields.push({
        type: 'rename',
        fieldName: added.newField?.name || '',
        oldField: removed.oldField,
        newField: added.newField,
        oldFieldName: removed.oldField?.name,
        newFieldName: added.newField?.name,
        changes: changes.length > 0 ? changes : undefined,
      });
    }

    result.fields = filteredFields;
  }

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

  return result;
}
