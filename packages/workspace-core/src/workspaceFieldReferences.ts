import {
  ensureFieldId,
  type CitusShardingConfig,
  type FieldRow,
  type ForeignKeyDefinition,
  type IndexDefinition,
  type IndexField,
  type MysqlPartitionConfig,
  type TableMiscConfig,
} from '@ddlbuilder/shared-types';

type StoredIndexField = IndexField & { fieldId?: string };
export type StoredIndexDefinition = Omit<IndexDefinition, 'fields'> & {
  fields: StoredIndexField[];
};

export type StoredForeignKeyDefinition = ForeignKeyDefinition & {
  localFieldIds?: Array<string | null>;
};

export type StoredCitusShardingConfig = CitusShardingConfig & {
  distributionColumnFieldId?: string;
};

export type StoredMysqlPartitionConfig = MysqlPartitionConfig & {
  columnFieldIds?: Array<string | null>;
};

type StoredHiveClusteringConfig = NonNullable<
  NonNullable<TableMiscConfig['partitions']>['clustering']
> & {
  columnFieldIds?: Array<string | null>;
};

export type StoredTableMiscConfig = Omit<TableMiscConfig, 'partitions'> & {
  partitions?: Omit<NonNullable<TableMiscConfig['partitions']>, 'clustering'> & {
    clustering?: StoredHiveClusteringConfig;
  };
};

const buildFieldReferences = (rows: FieldRow[]) => {
  const idsByName = new Map<string, string | null>();
  const namesById = new Map<string, string>();
  rows.forEach((row, index) => {
    const name = row.fieldName.trim();
    const id = ensureFieldId(row, index);
    idsByName.set(name, idsByName.has(name) ? null : id);
    namesById.set(id, name);
  });
  return { idsByName, namesById };
};

const encodeFieldIds = (names: string[], rows: FieldRow[]) => {
  const { idsByName } = buildFieldReferences(rows);
  const ids = names.map((name) => idsByName.get(name.trim()) ?? null);
  return ids.some(Boolean) ? ids : undefined;
};

const decodeFieldNames = (
  names: string[],
  ids: Array<string | null> | undefined,
  rows: FieldRow[],
) => {
  if (!ids) return names;
  const { namesById } = buildFieldReferences(rows);
  return names.map((name, index) => {
    const id = ids[index];
    return id ? (namesById.get(id) ?? name) : name;
  });
};

export const encodeIndexFieldReferences = (
  indexes: IndexDefinition[],
  rows: FieldRow[],
): StoredIndexDefinition[] => {
  const { idsByName } = buildFieldReferences(rows);
  return indexes.map((index) => ({
    ...index,
    fields: index.fields.map((field) => {
      const fieldId = idsByName.get(field.name.trim());
      return {
        name: field.name,
        direction: field.direction,
        ...(fieldId ? { fieldId } : {}),
      };
    }),
  }));
};

export const decodeIndexFieldReferences = (
  indexes: StoredIndexDefinition[],
  rows: FieldRow[],
): IndexDefinition[] => {
  const { namesById } = buildFieldReferences(rows);
  return indexes.map((index) => ({
    ...index,
    fields: index.fields.map((field) => ({
      name: field.fieldId ? (namesById.get(field.fieldId) ?? field.name) : field.name,
      direction: field.direction,
    })),
  }));
};

export const encodeForeignKeyFieldReferences = (
  foreignKeys: ForeignKeyDefinition[],
  rows: FieldRow[],
): StoredForeignKeyDefinition[] =>
  foreignKeys.map((foreignKey) => {
    const localFieldIds = encodeFieldIds(foreignKey.fields, rows);
    return {
      ...foreignKey,
      ...(localFieldIds ? { localFieldIds } : {}),
    };
  });

export const decodeForeignKeyFieldReferences = (
  foreignKeys: StoredForeignKeyDefinition[],
  rows: FieldRow[],
): ForeignKeyDefinition[] =>
  foreignKeys.map(({ localFieldIds, ...foreignKey }) => ({
    ...foreignKey,
    fields: decodeFieldNames(foreignKey.fields, localFieldIds, rows),
  }));

export const encodeCitusFieldReference = (
  config: CitusShardingConfig | undefined,
  rows: FieldRow[],
): StoredCitusShardingConfig | undefined => {
  if (!config) return undefined;
  const distributionColumnFieldId = config.distributionColumn
    ? encodeFieldIds([config.distributionColumn], rows)?.[0]
    : undefined;
  return {
    ...config,
    ...(distributionColumnFieldId ? { distributionColumnFieldId } : {}),
  };
};

export const decodeCitusFieldReference = (
  config: StoredCitusShardingConfig | undefined,
  rows: FieldRow[],
): CitusShardingConfig | undefined => {
  if (!config) return undefined;
  const { distributionColumnFieldId, ...decoded } = config;
  return {
    ...decoded,
    ...(decoded.distributionColumn && distributionColumnFieldId
      ? {
          distributionColumn: decodeFieldNames(
            [decoded.distributionColumn],
            [distributionColumnFieldId],
            rows,
          )[0],
        }
      : {}),
  };
};

export const encodeMysqlPartitionFieldReferences = (
  config: MysqlPartitionConfig | undefined,
  rows: FieldRow[],
): StoredMysqlPartitionConfig | undefined => {
  if (!config) return undefined;
  const columnFieldIds = encodeFieldIds(config.columns, rows);
  return { ...config, ...(columnFieldIds ? { columnFieldIds } : {}) };
};

export const decodeMysqlPartitionFieldReferences = (
  config: StoredMysqlPartitionConfig | undefined,
  rows: FieldRow[],
): MysqlPartitionConfig | undefined => {
  if (!config) return undefined;
  const { columnFieldIds, ...decoded } = config;
  return {
    ...decoded,
    columns: decodeFieldNames(decoded.columns, columnFieldIds, rows),
  };
};

export const encodeTableMiscFieldReferences = (
  config: TableMiscConfig | undefined,
  rows: FieldRow[],
): StoredTableMiscConfig | undefined => {
  if (!config?.partitions?.clustering) return config;
  const clustering = config.partitions.clustering;
  const columnFieldIds = encodeFieldIds(clustering.columns, rows);
  return {
    ...config,
    partitions: {
      ...config.partitions,
      clustering: { ...clustering, ...(columnFieldIds ? { columnFieldIds } : {}) },
    },
  };
};

export const decodeTableMiscFieldReferences = (
  config: StoredTableMiscConfig | undefined,
  rows: FieldRow[],
): TableMiscConfig | undefined => {
  if (!config?.partitions?.clustering) return config;
  const { columnFieldIds, ...clustering } = config.partitions.clustering;
  return {
    ...config,
    partitions: {
      ...config.partitions,
      clustering: {
        ...clustering,
        columns: decodeFieldNames(clustering.columns, columnFieldIds, rows),
      },
    },
  };
};
