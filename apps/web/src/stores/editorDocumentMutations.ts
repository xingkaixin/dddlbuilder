import type { FieldRow, PersistedState } from '@ddlbuilder/shared-types';
import { createEmptyRow } from '@/utils/helpers';
import {
  containsSqlIdentifierToken,
  isSameIdentifierToken,
  replaceIdentifierTokens,
} from '@/utils/fieldRenameUtils';
import { getIdentifierNameMaxLength, truncateIdentifierName } from '@ddlbuilder/ddl-core';

export function updateDocumentFields(state: PersistedState, rows: FieldRow[]): PersistedState {
  const previousNames = new Map(state.rows.map((row) => [row.id, row.fieldName.trim()]));
  const renames = new Map<string, string>();
  for (const row of rows) {
    if (!row.id) continue;
    const oldName = previousNames.get(row.id);
    const newName = row.fieldName.trim();
    if (oldName && newName && oldName !== newName) renames.set(oldName.toLowerCase(), newName);
  }
  if (renames.size === 0) return { ...state, rows };

  const rename = (name: string) => renames.get(name.toLowerCase()) ?? name;
  const renameIndexField = <T extends { name: string }>(field: T): T => {
    const name = rename(field.name);
    return name === field.name ? field : { ...field, name };
  };
  const tableMiscConfig = state.tableMiscConfig;
  const partitions = tableMiscConfig?.partitions;
  const clustering = partitions?.clustering;
  return {
    ...state,
    rows,
    currentIndexFields: state.currentIndexFields.map(renameIndexField),
    indexes: state.indexes.map((index) => {
      const indexRenames = new Map(
        index.fields
          .filter((field) => renames.has(field.name.toLowerCase()))
          .map((field) => [field.name.toLowerCase(), rename(field.name)]),
      );
      if (indexRenames.size === 0) return index;
      const name = replaceIdentifierTokens(index.name, indexRenames);
      return {
        ...index,
        name:
          name === index.name
            ? name
            : truncateIdentifierName(name, getIdentifierNameMaxLength(state.dbType)),
        fields: index.fields.map(renameIndexField),
      };
    }),
    foreignKeys: state.foreignKeys?.map((foreignKey) => ({
      ...foreignKey,
      fields: foreignKey.fields.map(rename),
    })),
    mysqlPartitionConfig: state.mysqlPartitionConfig
      ? {
          ...state.mysqlPartitionConfig,
          columns: state.mysqlPartitionConfig.columns.map((column) =>
            replaceIdentifierTokens(column, renames, 'sql'),
          ),
          expression: state.mysqlPartitionConfig.expression
            ? replaceIdentifierTokens(state.mysqlPartitionConfig.expression, renames, 'sql')
            : undefined,
        }
      : undefined,
    citusShardingConfig: state.citusShardingConfig
      ? {
          ...state.citusShardingConfig,
          distributionColumn: state.citusShardingConfig.distributionColumn
            ? rename(state.citusShardingConfig.distributionColumn)
            : undefined,
        }
      : undefined,
    tableMiscConfig:
      tableMiscConfig && partitions && clustering
        ? {
            ...tableMiscConfig,
            partitions: {
              ...partitions,
              clustering: { ...clustering, columns: clustering.columns.map(rename) },
            },
          }
        : tableMiscConfig,
  };
}

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
