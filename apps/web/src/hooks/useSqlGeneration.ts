import { copyText } from '@/utils/clipboard';
import { useMemo, useCallback } from 'react';
import type {
  DatabaseType,
  NormalizedField,
  IndexDefinition,
  CitusShardingConfig,
  MysqlPartitionConfig,
  SqlFormatMode,
  TableMiscConfig,
  ForeignKeyDefinition,
  SchemaObjectType,
} from '@ddlbuilder/shared-types';
import { buildDDL, buildDCL, buildViewDDL } from '@ddlbuilder/ddl-core';
import { buildQualifiedTableName } from '@ddlbuilder/ddl-core';

export interface UseSqlGenerationReturn {
  generatedSql: string;
  generatedDcl: string;
  copySql: () => Promise<boolean>;
  copyDcl: () => Promise<boolean>;
}

export function useSqlGeneration(
  objectType: SchemaObjectType,
  dbType: DatabaseType,
  schemaName: string,
  tableName: string,
  tableComment: string,
  viewDefinition: string,
  viewCreateOrReplace: boolean,
  normalizedFields: NormalizedField[],
  indexes: IndexDefinition[],
  authObjects: string[],
  sqlFormatMode: SqlFormatMode,
  citusShardingConfig?: CitusShardingConfig,
  mysqlPartitionConfig?: MysqlPartitionConfig,
  tableMiscConfig?: TableMiscConfig,
  foreignKeys?: ForeignKeyDefinition[],
): UseSqlGenerationReturn {
  const qualifiedTableName = useMemo(
    () => buildQualifiedTableName(schemaName, tableName, dbType),
    [schemaName, tableName, dbType],
  );

  const generatedSql = useMemo(
    () =>
      objectType === 'view'
        ? buildViewDDL(dbType, qualifiedTableName, viewDefinition, viewCreateOrReplace)
        : buildDDL({
            dbType,
            tableName: qualifiedTableName,
            tableComment,
            fields: normalizedFields,
            indexes,
            citusShardingConfig,
            mysqlPartitionConfig,
            tableMiscConfig,
            sqlFormatMode,
            foreignKeys,
          }),
    [
      objectType,
      dbType,
      qualifiedTableName,
      tableComment,
      viewDefinition,
      viewCreateOrReplace,
      normalizedFields,
      indexes,
      sqlFormatMode,
      citusShardingConfig,
      mysqlPartitionConfig,
      tableMiscConfig,
      foreignKeys,
    ],
  );

  const generatedDcl = useMemo(
    () => buildDCL(qualifiedTableName, authObjects, dbType),
    [qualifiedTableName, authObjects, dbType],
  );

  const copySql = useCallback(
    () => copyText(generatedSql || '-- 请在左侧填写表信息'),
    [generatedSql],
  );

  const copyDcl = useCallback(
    () => copyText(generatedDcl || '-- 请在下方配置授权对象'),
    [generatedDcl],
  );

  return {
    generatedSql,
    generatedDcl,
    copySql,
    copyDcl,
  };
}
