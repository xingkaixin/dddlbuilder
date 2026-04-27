import { memo, useState, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Copy, Download, Check, TableProperties, Minus, Plus, RefreshCw } from 'lucide-react';
import type { DatabaseType, NormalizedField } from '@ddlbuilder/shared-types';
import { generateMockData, downloadFile, type MockExportFormat } from '@/utils/mockDataGenerator';
import { useTranslation } from 'react-i18next';

interface MockDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  schemaName: string;
  dbType: DatabaseType;
  fields: NormalizedField[];
}

const MIN_ROWS = 1;
const MAX_ROWS = 100;
const DEFAULT_ROWS = 10;

export const MockDataDialog = memo<MockDataDialogProps>(
  ({ open, onOpenChange, tableName, schemaName, dbType, fields }) => {
    const { t } = useTranslation();
    const [rowCount, setRowCount] = useState(DEFAULT_ROWS);
    const [format, setFormat] = useState<MockExportFormat>('insert-sql');
    const [copied, setCopied] = useState(false);
    const [seed, setSeed] = useState(0);

    const output = useMemo(() => {
      if (!open) return null;
      // seed 用于强制刷新
      void seed;
      return generateMockData(tableName, schemaName, fields, dbType, { rowCount });
    }, [open, tableName, schemaName, fields, dbType, rowCount, seed]);

    const currentContent = useMemo(() => {
      if (!output) return '';
      if (format === 'insert-sql') return output.insertSql;
      if (format === 'csv') return output.csv;
      return output.json;
    }, [output, format]);

    const handleRowCountChange = useCallback((raw: string) => {
      const n = parseInt(raw, 10);
      if (!Number.isNaN(n)) {
        setRowCount(Math.min(MAX_ROWS, Math.max(MIN_ROWS, n)));
      }
    }, []);

    const handleCopy = useCallback(async () => {
      try {
        await navigator.clipboard.writeText(currentContent);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = currentContent;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }, [currentContent]);

    const handleDownload = useCallback(() => {
      const safeName = (tableName || 'table').replace(/[^\w-]/g, '_');
      if (format === 'insert-sql') {
        downloadFile(currentContent, `${safeName}_mock.sql`, 'text/plain;charset=utf-8');
      } else if (format === 'csv') {
        downloadFile(currentContent, `${safeName}_mock.csv`, 'text/csv;charset=utf-8');
      } else {
        downloadFile(currentContent, `${safeName}_mock.json`, 'application/json;charset=utf-8');
      }
    }, [currentContent, format, tableName]);

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl bg-card flex flex-col max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <TableProperties className="h-5 w-5 text-primary" />
              {t('mockData.title')}
            </DialogTitle>
            <DialogDescription>{t('mockData.description')}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 min-h-0 flex-1">
            {/* 行数配置 */}
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <Label className="shrink-0 text-sm font-medium">{t('mockData.rowCount')}</Label>
              <div className="flex h-7 items-center rounded-md border shadow-sm bg-background">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-none rounded-l-md border-r text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                      disabled={rowCount <= MIN_ROWS}
                      onClick={() => setRowCount((c) => Math.max(MIN_ROWS, c - 1))}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('mockData.rowCountDecrease')}</p>
                  </TooltipContent>
                </Tooltip>
                <Input
                  type="number"
                  min={MIN_ROWS}
                  max={MAX_ROWS}
                  value={rowCount}
                  onChange={(e) => handleRowCountChange(e.target.value)}
                  className="h-7 w-16 rounded-none border-0 text-center text-sm font-mono shadow-none focus-visible:ring-0"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-none rounded-r-md border-l text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                      disabled={rowCount >= MAX_ROWS}
                      onClick={() => setRowCount((c) => Math.min(MAX_ROWS, c + 1))}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('mockData.rowCountIncrease')}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <span className="text-xs text-muted-foreground">
                {t('mockData.rowCountHint', { max: MAX_ROWS })}
              </span>
            </div>

            {/* 格式 Tabs + 预览 */}
            <Tabs
              value={format}
              onValueChange={(v) => setFormat(v as MockExportFormat)}
              className="flex flex-col min-h-0 flex-1"
            >
              <div className="flex items-center justify-between">
                <TabsList className="h-8">
                  <TabsTrigger value="insert-sql" className="text-xs h-7 px-3">
                    INSERT SQL
                  </TabsTrigger>
                  <TabsTrigger value="csv" className="text-xs h-7 px-3">
                    CSV
                  </TabsTrigger>
                  <TabsTrigger value="json" className="text-xs h-7 px-3">
                    JSON
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 px-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setSeed((s) => s + 1)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('mockData.regenerate')}</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 px-2.5 text-xs"
                        onClick={handleCopy}
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copied ? t('mockData.copied') : t('mockData.copy')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('mockData.copyTip')}</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 px-2.5 text-xs"
                        onClick={handleDownload}
                      >
                        <Download className="h-3.5 w-3.5" />
                        {t('mockData.download')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('mockData.downloadTip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {(['insert-sql', 'csv', 'json'] as const).map((fmt) => (
                <TabsContent
                  key={fmt}
                  value={fmt}
                  className="mt-2 min-h-0 flex-1 rounded-lg border bg-muted/20 overflow-auto"
                >
                  <pre className="p-3 text-xs font-mono whitespace-pre leading-relaxed text-foreground min-h-[300px]">
                    {format === fmt ? currentContent : ''}
                  </pre>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    );
  },
);
MockDataDialog.displayName = 'MockDataDialog';
