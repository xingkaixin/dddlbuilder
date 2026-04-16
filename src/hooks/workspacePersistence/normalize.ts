import type { PersistedState } from '@ddlbuilder/shared-types';
import type { GlobalDraftSummary, WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import type { WorkspaceGlobalDraftRecord, WorkspaceSessionRecord } from '@/utils/workspaceStateDb';
import { getSchemaAndTable } from '@/utils/databaseTypeMapping';

export type GlobalDraftRecord = WorkspaceGlobalDraftRecord;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);

const toNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const normalizePersistedState = (value: unknown): PersistedState | null => {
  if (!isRecord(value)) return null;

  const explicitSchemaName = toText(value.schemaName);
  const rawTableName = toText(value.tableName);
  const { schema, table } =
    explicitSchemaName || !rawTableName.includes('.')
      ? { schema: explicitSchemaName, table: rawTableName }
      : getSchemaAndTable(rawTableName);

  const rows = Array.isArray(value.rows) ? value.rows : [];
  const currentIndexFields = Array.isArray(value.currentIndexFields)
    ? value.currentIndexFields
    : [];
  const indexes = Array.isArray(value.indexes) ? value.indexes : [];
  const authObjects = Array.isArray(value.authObjects)
    ? value.authObjects.filter((item): item is string => typeof item === 'string')
    : [];

  const normalized: PersistedState = {
    schemaName: schema,
    tableName: table,
    tableComment: toText(value.tableComment),
    dbType: toText(value.dbType, 'mysql') as PersistedState['dbType'],
    sqlFormatMode: value.sqlFormatMode === 'aligned' ? 'aligned' : 'compact',
    rows: rows.map((row, index) => {
      if (!isRecord(row)) {
        return {
          order: index + 1,
          fieldName: '',
          fieldType: '',
          fieldComment: '',
          nullable: '是',
          defaultKind: '无',
          defaultValue: '',
          onUpdate: '无',
        };
      }

      return {
        order: toNumber(row.order, index + 1),
        fieldName: toText(row.fieldName),
        fieldType: toText(row.fieldType),
        fieldComment: toText(row.fieldComment),
        nullable: row.nullable === '否' ? '否' : '是',
        defaultKind: toText(row.defaultKind, '无'),
        defaultValue: toText(row.defaultValue),
        onUpdate: toText(row.onUpdate, '无'),
      };
    }),
    addCount: toNumber(value.addCount, 10),
    indexInput: toText(value.indexInput),
    currentIndexFields: currentIndexFields
      .map((item) => {
        if (!isRecord(item)) return null;
        const name = toText(item.name);
        if (!name) return null;
        return {
          name,
          direction: item.direction === 'DESC' ? 'DESC' : 'ASC',
        };
      })
      .filter(Boolean) as PersistedState['currentIndexFields'],
    indexes: indexes
      .map((item) => {
        if (!isRecord(item)) return null;
        const name = toText(item.name);
        if (!name) return null;
        const fields = Array.isArray(item.fields)
          ? item.fields
              .map((field) => {
                if (!isRecord(field)) return null;
                const fieldName = toText(field.name);
                if (!fieldName) return null;
                return {
                  name: fieldName,
                  direction: field.direction === 'DESC' ? 'DESC' : 'ASC',
                };
              })
              .filter(Boolean)
          : [];
        return {
          id: toText(item.id, `idx_${Date.now()}_${Math.random()}`),
          name,
          fields: fields as PersistedState['indexes'][number]['fields'],
          unique: item.unique === true,
          isPrimary: item.isPrimary === true,
        };
      })
      .filter(Boolean) as PersistedState['indexes'],
    authInput: toText(value.authInput),
    authObjects,
  };

  if (isRecord(value.citusShardingConfig)) {
    normalized.citusShardingConfig =
      value.citusShardingConfig as PersistedState['citusShardingConfig'];
  }
  if (isRecord(value.mysqlPartitionConfig)) {
    normalized.mysqlPartitionConfig =
      value.mysqlPartitionConfig as PersistedState['mysqlPartitionConfig'];
  }
  if (isRecord(value.tableMiscConfig)) {
    normalized.tableMiscConfig = value.tableMiscConfig as PersistedState['tableMiscConfig'];
  }
  if (isRecord(value.fieldTableViewConfig)) {
    normalized.fieldTableViewConfig =
      value.fieldTableViewConfig as PersistedState['fieldTableViewConfig'];
  }

  return normalized;
};

export const isWorkspaceSource = (value: unknown): value is WorkspaceSource => {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'global_draft') return true;
  if (value.kind !== 'saved_table') return false;
  return (
    typeof value.normalizedName === 'string' &&
    value.normalizedName.length > 0 &&
    typeof value.tableName === 'string' &&
    typeof value.baseSignature === 'string'
  );
};

export const isSameWorkspaceSource = (a: WorkspaceSource, b: WorkspaceSource) => {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'global_draft' && b.kind === 'global_draft') return true;
  if (a.kind === 'saved_table' && b.kind === 'saved_table') {
    return (
      a.normalizedName === b.normalizedName &&
      a.tableName === b.tableName &&
      a.baseSignature === b.baseSignature
    );
  }
  return false;
};

export const buildGlobalDraftSummary = (
  state: PersistedState,
  updatedAt: number,
): GlobalDraftSummary => {
  const fieldCount = state.rows.filter((row) => row.fieldName?.trim()).length;
  const name = state.tableName.trim() || '未命名草稿';
  return {
    name,
    dbType: state.dbType,
    fieldCount,
    updatedAt,
  };
};

export const normalizeGlobalDraftRecord = (value: unknown): GlobalDraftRecord | null => {
  if (!isRecord(value)) return null;
  const state = normalizePersistedState(value.state);
  if (!state) return null;

  return {
    updatedAt: toNumber(value.updatedAt, Date.now()),
    state,
  };
};

export const normalizeWorkspaceSession = (value: unknown): WorkspaceSessionRecord | null => {
  if (!isRecord(value)) return null;
  if (!isWorkspaceSource(value.activeSource)) return null;

  return {
    activeSource: value.activeSource,
    activeState: normalizePersistedState(value.activeState),
    updatedAt: toNumber(value.updatedAt, Date.now()),
  };
};
