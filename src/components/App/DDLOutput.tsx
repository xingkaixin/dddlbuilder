import type { DatabaseType } from '@/types';
import { memo, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, ScrollText, ShieldCheck } from 'lucide-react';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomOneLight } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import sql from 'react-syntax-highlighter/dist/esm/languages/hljs/sql';
import { DATABASE_OPTIONS } from '@/utils/constants';

interface DDLOutputProps {
  generatedSql: string;
  generatedDcl: string;
  dbType: DatabaseType;
  onCopySql: () => void;
  onCopyDcl: () => void;
}

SyntaxHighlighter.registerLanguage('sql', sql);

const CODE_BLOCK_STYLE = {
  fontFamily: '"Roboto Mono", monospace',
  fontSize: '0.775rem',
  whiteSpace: 'pre-wrap',
  background: 'transparent',
};

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

    const tabConfigs = [
      {
        value: 'ddl',
        title: '建表 DDL',
        description: '根据左侧输入实时生成不同数据库的建表语句',
        copyLabel: '复制DDL',
        icon: ScrollText,
        isCopied: isSqlCopied,
        onCopy: handleCopySql,
        content: generatedSql,
        placeholder: '-- 请在左侧填写表信息',
      },
      {
        value: 'dcl',
        title: '授权 DCL',
        description: '生成数据库授权语句（GRANT）',
        copyLabel: '复制DCL',
        icon: ShieldCheck,
        isCopied: isDclCopied,
        onCopy: handleCopyDcl,
        content: generatedDcl,
        placeholder: '-- 请配置授权对象',
      },
    ];

    return (
      <div className="relative flex w-full flex-col rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5 lg:max-w-xl">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 to-transparent rounded-t-lg" />

        <Tabs defaultValue="ddl" className="relative flex flex-col">
          <div className="border-b border-primary/10 px-4 pt-4">
            <TabsList className="grid w-full grid-cols-2">
              {tabConfigs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="w-full gap-2"
                >
                  {tab.icon && <tab.icon className="h-4 w-4" />}
                  <span>{tab.title}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {tabConfigs.map((tab) => {
            const codeText = tab.content || tab.placeholder;
            return (
              <TabsContent key={tab.value} value={tab.value} className="mt-0">
                <div className="relative flex flex-col">
                  <div className="border-b border-primary/10 px-4 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent transition-colors duration-200">
                            {tab.title}
                          </h2>
                          <span className="transition-transform duration-200 hover:scale-105">
                            {renderDatabaseBadge()}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground/80">
                          {tab.description}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="gap-2 transition-all duration-200 hover:scale-105 hover:shadow-md"
                        onClick={tab.onCopy}
                      >
                        {tab.isCopied ? (
                          <>
                            <Check className="h-4 w-4 transition-transform duration-200" />{' '}
                            已复制
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 transition-transform duration-200" />{' '}
                            {tab.copyLabel}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="relative flex-1 overflow-auto px-4 py-3.5">
                    <SyntaxHighlighter
                      language="sql"
                      style={atomOneLight}
                      customStyle={CODE_BLOCK_STYLE}
                      showLineNumbers
                    >
                      {codeText}
                    </SyntaxHighlighter>
                  </div>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    );
  },
);
