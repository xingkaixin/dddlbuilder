import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { ParsedResult } from '@ddlbuilder/ddl-core/parser';
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
import type {
  DDLReviewResult as ReviewResult,
  DDLReviewStructuredSuggestion as StructuredSuggestion,
} from '@ddlbuilder/shared-types/ddl-review';
import type { GeneratedTableSchema } from '@/hooks/useAIGenerateTable';
import { buildPersistedStateFromAISchema } from '@/utils/aiSchemaChanges';
import { createFieldId } from '@ddlbuilder/workspace-core';

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
          setRows((prev) => [
            ...prev,
            {
              id: createFieldId(),
              fieldName: suggestion.field.fieldName,
              fieldType: suggestion.field.fieldType,
              fieldComment: suggestion.field.fieldComment || '',
              nullable: suggestion.field.nullable ?? true,
              defaultKind: suggestion.field.defaultKind ?? 'none',
              defaultValue: suggestion.field.defaultValue || '',
              onUpdate: suggestion.field.onUpdate ?? 'none',
            },
          ]);
          appliedCount = 1;
          triggerFieldTableHighlight(rows.length);
          break;

        case 'modify_field': {
          const { fieldName, changes } = suggestion.fieldModification;
          const rowIndex = rows.findIndex((row) => row.fieldName === fieldName);
          if (rowIndex !== -1) {
            setRows((prev) => {
              const updatedRows = [...prev];
              updatedRows[rowIndex] = { ...updatedRows[rowIndex], ...changes };
              return updatedRows;
            });
            appliedCount = 1;
            triggerFieldTableHighlight(rowIndex);
          } else {
            showToast(`未找到字段 "${fieldName}"，无法应用修改`);
          }
          break;
        }

        case 'remove_field': {
          const rowIndex = rows.findIndex((row) => row.fieldName === suggestion.fieldName);
          if (rowIndex !== -1) {
            triggerFieldTableHighlight(rowIndex);
            setTimeout(() => {
              setRows((prev) => prev.filter((row) => row.fieldName !== suggestion.fieldName));
            }, 500);
            appliedCount = 1;
          } else {
            showToast(`未找到字段 "${suggestion.fieldName}"，无法删除`);
          }
          break;
        }

        case 'add_index': {
          const indexId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          newIndexId = indexId;
          setIndexes((prev) => [
            ...prev,
            {
              id: indexId,
              name: suggestion.index.name,
              fields: suggestion.index.fields,
              unique: suggestion.index.unique === true,
            },
          ]);
          appliedCount = 1;
          setTimeout(() => {
            if (newIndexId) triggerIndexAnimation(newIndexId, 'add');
          }, 50);
          break;
        }

        case 'remove_index': {
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
          break;
        }

        case 'performance_warning':
        case 'general':
          showToast('该类型建议不支持自动应用，请手动调整');
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
    ],
  );

  const handleApplyAIGeneratedSchema = useCallback(
    (schema: GeneratedTableSchema) => {
      const nextState = buildPersistedStateFromAISchema(schema, {
        dbType,
        sqlFormatMode,
      });

      if (onApplyAIGeneratedState) {
        onApplyAIGeneratedState(nextState);
      } else {
        setSchemaName(nextState.schemaName);
        setTableName(nextState.tableName);
        setTableComment(nextState.tableComment);
        if (nextState.rows.length > 0) {
          setRows(nextState.rows);
        }
        if (nextState.indexes.length > 0) {
          setIndexes(nextState.indexes);
        }
      }

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
      showToast,
    ],
  );

  return {
    handleApplySuggestion,
    handleImport,
    handleApplyAIGeneratedSchema,
  };
}
