import { useMemo, useCallback } from "react";
import type { DatabaseType, NormalizedField, IndexDefinition } from "@/types";
import { buildDDL, buildDCL } from "@/utils/ddlGenerators";

export interface UseSqlGenerationReturn {
  generatedSql: string;
  generatedDcl: string;
  copySql: () => Promise<boolean>;
  copyDcl: () => Promise<boolean>;
}

export function useSqlGeneration(
  dbType: DatabaseType,
  tableName: string,
  tableComment: string,
  normalizedFields: NormalizedField[],
  indexes: IndexDefinition[],
  authObjects: string[],
): UseSqlGenerationReturn {
  const generatedSql = useMemo(
    () => buildDDL(dbType, tableName, tableComment, normalizedFields, indexes),
    [dbType, tableName, tableComment, normalizedFields, indexes]
  );

  const generatedDcl = useMemo(
    () => buildDCL(dbType, tableName, authObjects),
    [dbType, tableName, authObjects]
  );

  const copySql = useCallback(async () => {
    const text = generatedSql || "-- 请在左侧填写表信息";
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return true;
      } catch {
        return false;
      }
    }
  }, [generatedSql]);

  const copyDcl = useCallback(async () => {
    const text = generatedDcl || "-- 请在下方配置授权对象";
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
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
