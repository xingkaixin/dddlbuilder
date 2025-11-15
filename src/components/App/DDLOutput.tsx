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
      <div className="relative flex w-full flex-col rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5 lg:max-w-xl">
        {/* Decorative gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />

        {/* Top gradient bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 to-transparent rounded-t-lg" />

        {/* Upper Section - DDL Output */}
        <div className="relative flex flex-1 flex-col border-b">
          <div className="border-b border-primary/10 px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent transition-colors duration-200">
                    建表 DDL
                  </h2>
                  <span className="transition-transform duration-200 hover:scale-105">{renderDatabaseBadge()}</span>
                </div>
                <p className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground/80">
                  根据左侧输入实时生成不同数据库的建表语句
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="gap-2 transition-all duration-200 hover:scale-105 hover:shadow-md"
                onClick={handleCopySql}
              >
                {isSqlCopied ? (
                  <>
                    <Check className="h-4 w-4 transition-transform duration-200" /> 已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 transition-transform duration-200" /> 复制DDL
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="relative flex-1 overflow-auto px-4 py-3.5">
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
              showLineNumbers
            >
              {generatedSql || "-- 请在左侧填写表信息"}
            </SyntaxHighlighter>
          </div>
        </div>

        {/* Lower Section - DCL Output */}
        <div className="relative flex flex-1 flex-col">
          <div className="border-b border-primary/10 px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent transition-colors duration-200">
                    授权 DCL
                  </h2>
                  <span className="transition-transform duration-200 hover:scale-105">{renderDatabaseBadge()}</span>
                </div>
                <p className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground/80">
                  生成数据库授权语句（GRANT）
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="gap-2 transition-all duration-200 hover:scale-105 hover:shadow-md"
                onClick={handleCopyDcl}
              >
                {isDclCopied ? (
                  <>
                    <Check className="h-4 w-4 transition-transform duration-200" /> 已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 transition-transform duration-200" /> 复制DCL
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="relative flex-1 overflow-auto px-4 py-3.5">
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
