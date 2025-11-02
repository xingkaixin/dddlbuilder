import type { DatabaseType } from "@/types";
import { memo, useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomOneLight } from "react-syntax-highlighter/dist/esm/styles/hljs";
import sql from "react-syntax-highlighter/dist/esm/languages/hljs/sql";
import { DATABASE_OPTIONS } from "@/utils/constants";

interface DDLOutputProps {
  generatedSql: string;
  generatedDcl: string;
  dbType: DatabaseType;
  onCopySql: () => void;
  onCopyDcl: () => void;
}

SyntaxHighlighter.registerLanguage("sql", sql);

export const DDLOutput = memo<DDLOutputProps>(
  ({ generatedSql, generatedDcl, dbType, onCopySql, onCopyDcl }) => {
    const databaseOption = useMemo(
      () => DATABASE_OPTIONS.find((option) => option.value === dbType),
      [dbType],
    );
    const databaseLabel = databaseOption?.label ?? dbType.toUpperCase();
    const DatabaseIcon = databaseOption?.icon;

    const renderDatabaseBadge = () => (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
        {DatabaseIcon && <DatabaseIcon className="h-3.5 w-3.5" />}
        {databaseLabel}
      </span>
    );

    const [isSqlCopied, setIsSqlCopied] = useState(false);
    const [isDclCopied, setIsDclCopied] = useState(false);
    const sqlTimerRef = useRef<number | undefined>();
    const dclTimerRef = useRef<number | undefined>();

    useEffect(() => {
      return () => {
        if (sqlTimerRef.current) window.clearTimeout(sqlTimerRef.current);
        if (dclTimerRef.current) window.clearTimeout(dclTimerRef.current);
      };
    }, []);

    const handleCopySql = useCallback(async () => {
      const success = await onCopySql();
      if (!success) return;
      if (sqlTimerRef.current) window.clearTimeout(sqlTimerRef.current);
      setIsSqlCopied(true);
      sqlTimerRef.current = window.setTimeout(
        () => setIsSqlCopied(false),
        3000,
      );
    }, [onCopySql]);

    const handleCopyDcl = useCallback(async () => {
      const success = await onCopyDcl();
      if (!success) return;
      if (dclTimerRef.current) window.clearTimeout(dclTimerRef.current);
      setIsDclCopied(true);
      dclTimerRef.current = window.setTimeout(
        () => setIsDclCopied(false),
        3000,
      );
    }, [onCopyDcl]);

    return (
      <div className="flex w-full flex-col rounded-lg border bg-card shadow-sm lg:max-w-xl">
        {/* Upper Section - DDL Output */}
        <div className="flex flex-1 flex-col border-b">
          <div className="border-b px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">建表 DDL</h2>
                  {renderDatabaseBadge()}
                </div>
                <p className="text-sm text-muted-foreground">
                  根据左侧输入实时生成不同数据库的建表语句
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1"
                onClick={handleCopySql}
              >
                {isSqlCopied ? (
                  <>
                    <Check className="h-4 w-4" /> 已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> 复制DDL
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto px-6 py-4">
            <SyntaxHighlighter
              language="sql"
              style={atomOneLight}
              customStyle={{
                fontFamily:
                  '"SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", monospace',
                fontSize: "0.775rem",
                whiteSpace: "pre-wrap",
                background: "transparent",
              }}
              // wrapLongLines
              showLineNumbers
            >
              {generatedSql || "-- 请在左侧填写表信息"}
            </SyntaxHighlighter>
          </div>
        </div>

        {/* Lower Section - DCL Output */}
        <div className="flex flex-1 flex-col">
          <div className="border-b px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">授权 DCL</h2>
                  {renderDatabaseBadge()}
                </div>
                <p className="text-sm text-muted-foreground">
                  生成数据库授权语句（GRANT）
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1"
                onClick={handleCopyDcl}
              >
                {isDclCopied ? (
                  <>
                    <Check className="h-4 w-4" /> 已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> 复制DCL
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto px-6 py-4">
            <SyntaxHighlighter
              language="sql"
              style={atomOneLight}
              customStyle={{
                fontFamily:
                  '"SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", monospace',
                fontSize: "0.775rem",
                whiteSpace: "pre-wrap",
                background: "transparent",
              }}
              // wrapLongLines
              showLineNumbers
            >
              {generatedDcl || "-- 请在下方配置授权对象"}
            </SyntaxHighlighter>
          </div>
        </div>
      </div>
    );
  },
);
