import type { FieldRow, PersistedState } from '@ddlbuilder/shared-types';
import { createEmptyRow } from '@/utils/helpers';
import { containsSqlIdentifierToken, isSameIdentifierToken } from '@/utils/fieldRenameUtils';

const matchesRemovedField = (fieldName: string, removedFieldNames: string[]) =>
  removedFieldNames.some((removedName) => isSameIdentifierToken(fieldName, removedName));

const removeExpressionReferences = (
  expression: string | undefined,
  removedFieldNames: string[],
) => {
  if (!expression) return expression;
  const referencesRemovedField = removedFieldNames.some((fieldName) =>
    containsSqlIdentifierToken(expression, fieldName),
  );
  return referencesRemovedField ? undefined : expression;
};

export function removeFieldsFromDocument(
  state: PersistedState,
  shouldRemove: (row: FieldRow, index: number) => boolean,
): PersistedState {
  const removedFieldNames = state.rows
    .filter(shouldRemove)
    .map((row) => row.fieldName.trim())
    .filter(Boolean);
  const remainingRows = state.rows.filter((row, index) => !shouldRemove(row, index));
  const rows = remainingRows.length > 0 ? remainingRows : [createEmptyRow()];

  if (removedFieldNames.length === 0) return { ...state, rows };

  const mysqlPartitionConfig = state.mysqlPartitionConfig
    ? {
        ...state.mysqlPartitionConfig,
        columns: state.mysqlPartitionConfig.columns.filter(
          (column) => !matchesRemovedField(column, removedFieldNames),
        ),
        expression: removeExpressionReferences(
          state.mysqlPartitionConfig.expression,
          removedFieldNames,
        ),
      }
    : undefined;
  if (
    mysqlPartitionConfig &&
    mysqlPartitionConfig.columns.length === 0 &&
    !mysqlPartitionConfig.expression
  ) {
    mysqlPartitionConfig.enabled = false;
  }

  const citusShardingConfig = state.citusShardingConfig
    ? matchesRemovedField(state.citusShardingConfig.distributionColumn ?? '', removedFieldNames)
      ? { mode: 'reference' as const, distributionColumn: undefined }
      : state.citusShardingConfig
    : undefined;

  const clustering = state.tableMiscConfig?.partitions?.clustering;
  const nextClustering = clustering
    ? {
        ...clustering,
        columns: clustering.columns.filter(
          (column) => !matchesRemovedField(column, removedFieldNames),
        ),
      }
    : undefined;
  if (nextClustering && nextClustering.columns.length === 0) nextClustering.enabled = false;
  const tableMiscConfig = state.tableMiscConfig
    ? {
        ...state.tableMiscConfig,
        partitions: state.tableMiscConfig.partitions
          ? {
              ...state.tableMiscConfig.partitions,
              clustering: nextClustering,
            }
          : undefined,
      }
    : undefined;

  return {
    ...state,
    rows,
    currentIndexFields: state.currentIndexFields.filter(
      (field) => !matchesRemovedField(field.name, removedFieldNames),
    ),
    indexes: state.indexes.filter(
      (index) => !index.fields.some((field) => matchesRemovedField(field.name, removedFieldNames)),
    ),
    foreignKeys: state.foreignKeys?.filter(
      (foreignKey) =>
        !foreignKey.fields.some((field) => matchesRemovedField(field, removedFieldNames)),
    ),
    mysqlPartitionConfig,
    citusShardingConfig,
    tableMiscConfig,
  };
}
