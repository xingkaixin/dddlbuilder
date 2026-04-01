import { useMemo, useCallback } from 'react';
import type {
  DatabaseType,
  NormalizedField,
  IndexDefinition,
  CitusShardingConfig,
  MysqlPartitionConfig,
  TableMiscConfig,
} from '@/types';
import { buildDDL, buildDCL } from '@/utils/ddlGenerators';
import { buildQualifiedTableName } from '@/utils/databaseTypeMapping';

export interface UseSqlGenerationReturn {
  generatedSql: string;
  generatedDcl: string;
  copySql: () => Promise<boolean>;
  copyDcl: () => Promise<boolean>;
}

export function useSqlGeneration(
  dbType: DatabaseType,
  schemaName: string,
  tableName: string,
  tableComment: string,
  normalizedFields: NormalizedField[],
  indexes: IndexDefinition[],
  authObjects: string[],
  citusShardingConfig?: CitusShardingConfig,
  mysqlPartitionConfig?: MysqlPartitionConfig,
  tableMiscConfig?: TableMiscConfig,
): UseSqlGenerationReturn {
  const qualifiedTableName = useMemo(
    () => buildQualifiedTableName(schemaName, tableName),
    [schemaName, tableName],
  );

  const generatedSql = useMemo(
    () =>
      buildDDL(
        dbType,
        qualifiedTableName,
        tableComment,
        normalizedFields,
        indexes,
        citusShardingConfig,
        mysqlPartitionConfig,
        tableMiscConfig,
      ),
    [
      dbType,
      qualifiedTableName,
      tableComment,
      normalizedFields,
      indexes,
      citusShardingConfig,
      mysqlPartitionConfig,
      tableMiscConfig,
    ],
  );

  const generatedDcl = useMemo(
    () => buildDCL(dbType, qualifiedTableName, authObjects),
    [dbType, qualifiedTableName, authObjects],
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
