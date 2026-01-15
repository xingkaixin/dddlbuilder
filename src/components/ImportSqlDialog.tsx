import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { DatabaseType } from '@/types';
import type { ParsedResult } from '@/utils/SqlParser';
import { useToast } from '@/hooks/useToast';

interface ImportSqlDialogProps {
  currentDbType: DatabaseType;
  onImport: (result: ParsedResult, dbType: DatabaseType) => void;
  triggerClassName?: string;
  triggerIcon?: ReactNode;
  triggerLabel?: string;
}

export function ImportSqlDialog({
  currentDbType,
  onImport,
  triggerClassName,
  triggerIcon,
  triggerLabel = '导入 SQL',
}: ImportSqlDialogProps) {
  const [open, setOpen] = useState(false);
  const [sql, setSql] = useState('');
  const [selectedDbType, setSelectedDbType] =
    useState<DatabaseType>(currentDbType);
  const { showToast } = useToast();

  const handleImport = async () => {
    if (!sql.trim()) {
      showToast('请输入 SQL: SQL 内容不能为空');
      return;
    }

    try {
      const { SqlParser } = await import('@/utils/SqlParser');
      const parser = new SqlParser();
      const result = parser.parse(sql, selectedDbType);

      if (result.fields.length === 0 && result.tableName === '') {
        showToast(
          '解析结果为空: 未能从 SQL 中解析出有效的表结构，请检查 SQL 语法。',
        );
        return;
      }

      onImport(result, selectedDbType);
      setOpen(false);
      setSql('');
      showToast(`导入成功: 成功解析表: ${result.tableName || '未命名'}`);
    } catch (error: any) {
      showToast(`解析失败: ${error.message || '未知错误'}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={triggerClassName}>
          {triggerIcon}
          <span>{triggerLabel}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>导入 SQL</DialogTitle>
          <DialogDescription>
            粘贴 CREATE TABLE
            语句以自动生成表结构配置。请选择正确的源数据库类型以确保解析准确。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="db-type" className="text-right">
              源数据库
            </Label>
            <Select
              value={selectedDbType}
              onValueChange={(v) => setSelectedDbType(v as DatabaseType)}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="选择数据库类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mysql">MySQL</SelectItem>
                <SelectItem value="postgresql">PostgreSQL</SelectItem>
                <SelectItem value="postgresql-citus">
                  PostgreSQL (Citus)
                </SelectItem>
                <SelectItem value="sqlserver">SQL Server</SelectItem>
                <SelectItem value="oracle">Oracle</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sql-content">SQL 内容</Label>
            <textarea
              id="sql-content"
              className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="CREATE TABLE users ( id INT PRIMARY KEY, ... );"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleImport}>
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
