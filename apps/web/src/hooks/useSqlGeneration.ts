import { copyText } from '@/utils/clipboard';
import { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
import { localizeDdlNotices } from '@/utils/ddlNotices';
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
  const { t } = useTranslation();

  const qualifiedTableName = useMemo(
    () => buildQualifiedTableName(schemaName, tableName, dbType),
    [schemaName, tableName, dbType],
  );

  const generatedSql = useMemo(
    () =>
      localizeDdlNotices(
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
        t,
      ),
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
      t,
    ],
  );

  const generatedDcl = useMemo(
    () => buildDCL(qualifiedTableName, authObjects, dbType),
    [qualifiedTableName, authObjects, dbType],
  );

  const copySql = useCallback(
    () => copyText(generatedSql || t('ddlOutput.emptyDdl')),
    [generatedSql, t],
  );

  const copyDcl = useCallback(
    () => copyText(generatedDcl || t('ddlOutput.emptyDcl')),
    [generatedDcl, t],
  );

  return {
    generatedSql,
    generatedDcl,
    copySql,
    copyDcl,
  };
}
