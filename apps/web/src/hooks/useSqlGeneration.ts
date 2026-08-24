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
import { mergeEnumMetaIntoComment } from '@/utils/enumCommentMerger';

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
    () => buildQualifiedTableName(schemaName, tableName),
    [schemaName, tableName],
  );

  const fieldsForDdl = useMemo(
    () => mergeEnumMetaIntoComment(normalizedFields),
    [normalizedFields],
  );

  const generatedSql = useMemo(
    () =>
      objectType === 'view'
        ? buildViewDDL(dbType, qualifiedTableName, viewDefinition, viewCreateOrReplace)
        : buildDDL({
            dbType,
            tableName: qualifiedTableName,
            tableComment,
            fields: fieldsForDdl,
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
      fieldsForDdl,
      indexes,
      sqlFormatMode,
      citusShardingConfig,
      mysqlPartitionConfig,
      tableMiscConfig,
      foreignKeys,
    ],
  );

  const generatedDcl = useMemo(
    () => buildDCL(qualifiedTableName, authObjects),
    [qualifiedTableName, authObjects],
  );

  const copySql = useCallback(async () => {
    const text = generatedSql || '-- 请在左侧填写表信息';
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
      } catch {
        return false;
      }
    }
  }, [generatedSql]);

  const copyDcl = useCallback(async () => {
    const text = generatedDcl || '-- 请在下方配置授权对象';
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
      } catch {
        return false;
      }
    }
  }, [generatedDcl]);

  return {
    generatedSql,
    generatedDcl,
    copySql,
    copyDcl,
  };
}
