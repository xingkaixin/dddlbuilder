import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { ParsedResult } from '@/utils/SqlParser';
import { getSchemaAndTable } from '@ddlbuilder/ddl-core';
import { convertParsedResultToPersistedState } from '@/utils/convertParsedResultToPersistedState';
import type {
  DatabaseType,
  FieldRow,
  IndexDefinition,
  MysqlPartitionConfig,
  PersistedState,
  SqlFormatMode,
  TableMiscConfig,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import type { ReviewResult, StructuredSuggestion } from '@/hooks/useDDLReview';
import type { GeneratedTableSchema } from '@/hooks/useAIGenerateTable';

type AnalyticsValue = string | number | boolean | null | undefined;

interface UseSchemaApplyActionsParams {
  rows: FieldRow[];
  indexes: IndexDefinition[];
  reviewResult: ReviewResult | null;
  setRows: Dispatch<SetStateAction<FieldRow[]>>;
  setIndexes: Dispatch<SetStateAction<IndexDefinition[]>>;
  setForeignKeys: Dispatch<SetStateAction<ForeignKeyDefinition[]>>;
  setReviewResult: (result: ReviewResult | null) => void;
  setIndexInput: (value: string) => void;
  setAuthObjects: Dispatch<SetStateAction<string[]>>;
  setAuthInput: Dispatch<SetStateAction<string>>;
  setSchemaName: (value: string) => void;
  setTableName: (value: string) => void;
  setTableComment: (value: string) => void;
  setDbType: (value: DatabaseType) => void;
  dbType: DatabaseType;
  sqlFormatMode: SqlFormatMode;
  setTableMiscConfig: Dispatch<SetStateAction<TableMiscConfig>>;
  setMysqlPartitionConfig: Dispatch<SetStateAction<MysqlPartitionConfig>>;
  setActiveTab: (value: string) => void;
  triggerIndexAnimation: (indexId: string, mode: 'add' | 'remove') => void;
  triggerFieldTableHighlight: (rowIndex: number) => void;
  showToast: (message: string) => void;
  trackEvent: (event: string, data?: Record<string, AnalyticsValue>) => Promise<void>;
  onApplyAIGeneratedState?: (state: PersistedState) => void;
}

const DEFAULT_TABLE_MISC_CONFIG: TableMiscConfig = {
  enabled: false,
  engine: '',
  charset: '',
  collation: '',
  tablespace: '',
};

const DEFAULT_MYSQL_PARTITION_CONFIG: MysqlPartitionConfig = {
  enabled: false,
  type: 'RANGE',
  columns: [],
  partitionCount: 4,
  partitions: [],
};

function buildAIGeneratedRows(schema: GeneratedTableSchema): FieldRow[] {
  return schema.fields.map((field, index) => ({
    order: index + 1,
    fieldName: field.fieldName,
    fieldType: field.fieldType,
    fieldComment: field.fieldComment,
    nullable: field.nullable,
    defaultKind: field.defaultKind,
    defaultValue: field.defaultValue || '',
    onUpdate: field.onUpdate || '无',
  })) as FieldRow[];
}

function buildAIGeneratedIndexes(schema: GeneratedTableSchema): IndexDefinition[] {
  if (!schema.indexes || schema.indexes.length === 0) {
    return [];
  }

  const now = Date.now();
  const newIndexes = schema.indexes.map((index, i) => ({
    id: `ai-${now}-${i}`,
    name: index.name,
    fields: index.fields,
    unique: index.unique,
    isPrimary: false,
  }));

  const pkFields = schema.fields
    ?.filter((field) => field.isPrimaryKey)
    .map((field) => ({
      name: field.fieldName,
      direction: 'ASC' as const,
    }));

  if (pkFields && pkFields.length > 0) {
    newIndexes.unshift({
      id: `pk-${now}`,
      name: 'PRIMARY',
      fields: pkFields,
      unique: true,
      isPrimary: true,
    });
  }

  return newIndexes as IndexDefinition[];
}

function resolveGeneratedTableIdentity(schema: GeneratedTableSchema) {
  const qualifiedIdentity = schema.tableName?.includes('.')
    ? getSchemaAndTable(schema.tableName)
    : null;

  if (schema.schemaName) {
    return {
      schemaName: schema.schemaName,
      tableName: qualifiedIdentity ? qualifiedIdentity.table : schema.tableName,
    };
  }

  if (qualifiedIdentity) {
    return {
      schemaName: qualifiedIdentity.schema,
      tableName: qualifiedIdentity.table,
    };
  }

  return {
    schemaName: '',
    tableName: schema.tableName,
  };
}

export function useSchemaApplyActions({
  rows,
  indexes,
  reviewResult,
  setRows,
  setIndexes,
  setForeignKeys,
  setReviewResult,
  setIndexInput,
  setAuthObjects,
  setAuthInput,
  setSchemaName,
  setTableName,
  setTableComment,
  setDbType,
  dbType,
  sqlFormatMode,
  setTableMiscConfig,
  setMysqlPartitionConfig,
  setActiveTab,
  triggerIndexAnimation,
  triggerFieldTableHighlight,
  showToast,
  trackEvent,
  onApplyAIGeneratedState,
}: UseSchemaApplyActionsParams) {
  const handleApplySuggestion = useCallback(
    (suggestion: StructuredSuggestion) => {
      if (suggestion.applied) return;

      let appliedCount = 0;
      let newIndexId: string | null = null;

      if (suggestion.type === 'add_index' || suggestion.type === 'remove_index') {
        setActiveTab('indexes');
      } else if (
        suggestion.type === 'add_field' ||
        suggestion.type === 'modify_field' ||
        suggestion.type === 'remove_field'
      ) {
        setActiveTab('fields');
      }

      switch (suggestion.type) {
        case 'add_field':
          if (suggestion.field) {
            const newRow: FieldRow = {
              order: rows.length + 1,
              fieldName: suggestion.field.fieldName,
              fieldType: suggestion.field.fieldType,
              fieldComment: suggestion.field.fieldComment || '',
              nullable: suggestion.field.nullable || '是',
              defaultKind: suggestion.field.defaultKind || '无',
              defaultValue: suggestion.field.defaultValue || '',
              onUpdate: suggestion.field.onUpdate || '无',
            };
            setRows((prev) => [...prev, newRow]);
            appliedCount = 1;
            triggerFieldTableHighlight(rows.length);
          } else {
            showToast('该建议缺少字段信息，无法自动应用');
          }
          break;

        case 'modify_field':
          if (suggestion.fieldModification) {
            const { fieldName } = suggestion.fieldModification;
            const changes = suggestion.fieldModification.changes;
            const rowIndex = rows.findIndex((row) => row.fieldName === fieldName);
            if (rowIndex !== -1) {
              const filteredChanges = Object.fromEntries(
                Object.entries(changes).filter(([, value]) => value !== undefined),
              );
              setRows((prev) => {
                const updatedRows = [...prev];
                updatedRows[rowIndex] = {
                  ...updatedRows[rowIndex],
                  ...filteredChanges,
                };
                return updatedRows;
              });
              appliedCount = 1;
              triggerFieldTableHighlight(rowIndex);
            } else {
              showToast(`未找到字段 "${fieldName}"，无法应用修改`);
            }
          } else {
            showToast('该建议缺少字段修改信息，无法自动应用');
          }
          break;

        case 'remove_field':
          if (suggestion.fieldName) {
            const rowIndex = rows.findIndex((row) => row.fieldName === suggestion.fieldName);
            if (rowIndex !== -1) {
              triggerFieldTableHighlight(rowIndex);
              setTimeout(() => {
                setRows((prev) => {
                  const newRows = prev.filter((row) => row.fieldName !== suggestion.fieldName);
                  return newRows.map((row, index) => ({
                    ...row,
                    order: index + 1,
                  }));
                });
              }, 500);
              appliedCount = 1;
            } else {
              showToast(`未找到字段 "${suggestion.fieldName}"，无法删除`);
            }
          } else {
            showToast('该建议缺少字段名，无法自动应用');
          }
          break;

        case 'add_index':
          if (suggestion.index) {
            newIndexId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            const newIndex: IndexDefinition = {
              id: newIndexId,
              name: suggestion.index.name,
              fields: suggestion.index.fields,
              unique: !!suggestion.index.unique,
            };
            setIndexes((prev) => [...prev, newIndex]);
            appliedCount = 1;
            setTimeout(() => {
              if (newIndexId) {
                triggerIndexAnimation(newIndexId, 'add');
              }
            }, 50);
          } else {
            showToast('该建议缺少索引信息，无法自动应用');
          }
          break;

        case 'remove_index':
          if (suggestion.indexName) {
            const targetIndex = indexes.find((index) => index.name === suggestion.indexName);
            if (targetIndex) {
              triggerIndexAnimation(targetIndex.id, 'remove');
              setTimeout(() => {
                setIndexes((prev) => prev.filter((index) => index.name !== suggestion.indexName));
              }, 500);
              appliedCount = 1;
            } else {
              showToast(`未找到索引 "${suggestion.indexName}"，无法删除`);
            }
          } else {
            showToast('该建议缺少索引名，无法自动应用');
          }
          break;

        case 'performance_warning':
        case 'general':
          showToast('该类型建议不支持自动应用，请手动调整');
          break;

        default:
          showToast('该建议无法自动应用，请手动调整');
          break;
      }

      if (appliedCount > 0 && reviewResult) {
        const newSuggestions = reviewResult.suggestions.map((item) => {
          if (typeof item !== 'string' && item.id === suggestion.id) {
            return { ...item, applied: true };
          }
          return item;
        });
        setReviewResult({ ...reviewResult, suggestions: newSuggestions });
        void trackEvent('sql_suggestion_apply', {
          type: suggestion.type,
          description: suggestion.description,
        });
        showToast(`已应用建议：${suggestion.description}`);
      }
    },
    [
      rows,
      indexes,
      reviewResult,
      setRows,
      setIndexes,
      setReviewResult,
      showToast,
      trackEvent,
      triggerIndexAnimation,
      triggerFieldTableHighlight,
      setActiveTab,
    ],
  );

  const handleImport = useCallback(
    (result: ParsedResult, importDbType: DatabaseType) => {
      const state = convertParsedResultToPersistedState(result, importDbType);

      setSchemaName(state.schemaName);
      setTableName(state.tableName);
      setTableComment(state.tableComment);
      setDbType(state.dbType);
      setTableMiscConfig(state.tableMiscConfig ?? DEFAULT_TABLE_MISC_CONFIG);
      setMysqlPartitionConfig(state.mysqlPartitionConfig ?? DEFAULT_MYSQL_PARTITION_CONFIG);
      setRows(state.rows);
      setIndexes(state.indexes);
      setIndexInput('');
      setForeignKeys(state.foreignKeys ?? []);
      setAuthObjects(state.authObjects);
      setAuthInput('');
      void trackEvent('sql_import', { dbType: importDbType });
    },
    [
      setRows,
      setIndexes,
      setForeignKeys,
      setAuthObjects,
      setIndexInput,
      setAuthInput,
      setSchemaName,
      setTableName,
      setTableComment,
      setDbType,
      setTableMiscConfig,
      setMysqlPartitionConfig,
      trackEvent,
    ],
  );

  const handleApplyAIGeneratedSchema = useCallback(
    (schema: GeneratedTableSchema) => {
      const identity = resolveGeneratedTableIdentity(schema);
      const generatedRows =
        schema.fields && schema.fields.length > 0 ? buildAIGeneratedRows(schema) : [];
      const generatedIndexes = buildAIGeneratedIndexes(schema);
      const nextState: PersistedState = {
        objectType: 'table',
        schemaName: identity.schemaName,
        tableName: identity.tableName,
        tableComment: schema.tableComment || '',
        dbType,
        sqlFormatMode,
        rows: generatedRows,
        addCount: 10,
        indexInput: '',
        currentIndexFields: [],
        indexes: generatedIndexes,
        authInput: '',
        authObjects: [],
        tableMiscConfig: DEFAULT_TABLE_MISC_CONFIG,
        mysqlPartitionConfig: DEFAULT_MYSQL_PARTITION_CONFIG,
        foreignKeys: [],
      };

      if (onApplyAIGeneratedState) {
        onApplyAIGeneratedState(nextState);
      } else {
        setSchemaName(nextState.schemaName);
        setTableName(nextState.tableName);
        setTableComment(nextState.tableComment);
        if (generatedRows.length > 0) {
          setRows(generatedRows);
        }
        if (generatedIndexes.length > 0) {
          setIndexes(generatedIndexes);
        }
      }

      void trackEvent('ai_generate_apply', { tableName: schema.tableName });
      showToast('大师建表工坊的表结构已应用');
    },
    [
      dbType,
      sqlFormatMode,
      onApplyAIGeneratedState,
      setSchemaName,
      setTableName,
      setTableComment,
      setRows,
      setIndexes,
      trackEvent,
      showToast,
    ],
  );

  return {
    handleApplySuggestion,
    handleImport,
    handleApplyAIGeneratedSchema,
  };
}
