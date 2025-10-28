import React from "react";
import { memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vs } from "react-syntax-highlighter/dist/esm/styles/prism";

interface DDLOutputProps {
  generatedSql: string;
  generatedDcl: string;
  onCopySql: () => void;
  onCopyDcl: () => void;
}

export const DDLOutput = memo<DDLOutputProps>(({
  generatedSql,
  generatedDcl,
  onCopySql,
  onCopyDcl,
}) => {
  const customTheme = useMemo(() => {
    const basePlain = (vs as Record<string, unknown>).plain as
      | Record<string, unknown>
      | undefined;
    return {
      ...vs,
      plain: {
        ...(basePlain ?? {}),
        color: "#000",
        backgroundColor: "transparent",
      },
    };
  }, []);

  return (
    <div className="flex w-full flex-col rounded-lg border bg-card shadow-sm lg:max-w-xl">
      {/* Upper Section - DDL Output */}
      <div className="flex flex-1 flex-col border-b">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">建表 DDL</h2>
              <p className="text-xs text-muted-foreground">
                根据左侧输入实时生成不同数据库的建表语句
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="gap-1"
              onClick={onCopySql}
            >
              <Copy className="h-4 w-4" /> 复制DDL
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto px-4 py-4">
          <SyntaxHighlighter
            language="sql"
            style={customTheme}
            customStyle={{
              background: "transparent",
              margin: 0,
              padding: 0,
              fontSize: "1rem",
            }}
            lineNumberStyle={{ color: "#000" }}
            showLineNumbers
          >
            {generatedSql || "-- 请在左侧填写表信息"}
          </SyntaxHighlighter>
        </div>
      </div>

      {/* Lower Section - DCL Output */}
      <div className="flex flex-1 flex-col">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">授权 DCL</h2>
              <p className="text-xs text-muted-foreground">
                生成数据库授权语句（GRANT）
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="gap-1"
              onClick={onCopyDcl}
            >
              <Copy className="h-4 w-4" /> 复制DCL
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto px-4 py-4">
          <SyntaxHighlighter
            language="sql"
            style={customTheme}
            customStyle={{
              background: "transparent",
              margin: 0,
              padding: 0,
              fontSize: "1rem",
            }}
            lineNumberStyle={{ color: "#000" }}
            showLineNumbers
          >
            {generatedDcl || "-- 请在下方配置授权对象"}
          </SyntaxHighlighter>
        </div>
      </div>
    </div>
  );
});