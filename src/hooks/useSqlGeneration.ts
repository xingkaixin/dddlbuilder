import { useMemo, useCallback } from "react";
import type { DatabaseType, NormalizedField, IndexDefinition } from "@/types";
import { buildDDL, buildDCL } from "@/utils/ddlGenerators";

export interface UseSqlGenerationReturn {
  generatedSql: string;
  generatedDcl: string;
  copySql: () => Promise<void>;
  copyDcl: () => Promise<void>;
}

export function useSqlGeneration(
  dbType: DatabaseType,
  tableName: string,
  tableComment: string,
  normalizedFields: NormalizedField[],
  indexes: IndexDefinition[],
  authObjects: string[],
  showToast: (msg: string) => void
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
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } finally {
      showToast("DDL已复制到剪贴板");
    }
  }, [generatedSql, showToast]);

  const copyDcl = useCallback(async () => {
    const text = generatedDcl || "-- 请在下方配置授权对象";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } finally {
      showToast("DCL已复制到剪贴板");
    }
  }, [generatedDcl, showToast]);

  return {
    generatedSql,
    generatedDcl,
    copySql,
    copyDcl,
  };
}