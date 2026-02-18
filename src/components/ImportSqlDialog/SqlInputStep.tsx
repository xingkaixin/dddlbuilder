import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { DatabaseType } from '@/types';
import type { ValidationResult } from './types';

interface SqlInputStepProps {
  selectedDbType: DatabaseType;
  onDbTypeChange: (dbType: DatabaseType) => void;
  sql: string;
  onSqlChange: (sql: string) => void;
  validationResult: ValidationResult | null;
}

export function SqlInputStep({
  selectedDbType,
  onDbTypeChange,
  sql,
  onSqlChange,
  validationResult,
}: SqlInputStepProps) {
  return (
    <>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="db-type" className="text-right">
          源数据库
        </Label>
        <Select
          value={selectedDbType}
          onValueChange={(v) => onDbTypeChange(v as DatabaseType)}
        >
          <SelectTrigger className="col-span-3">
            <SelectValue placeholder="选择数据库类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mysql">MySQL</SelectItem>
            <SelectItem value="postgresql">PostgreSQL</SelectItem>
            <SelectItem value="postgresql-citus">PostgreSQL (Citus)</SelectItem>
            <SelectItem value="sqlserver">SQL Server</SelectItem>
            <SelectItem value="oracle">Oracle</SelectItem>
            <SelectItem value="mariadb">MariaDB</SelectItem>
            <SelectItem value="tidb">TiDB</SelectItem>
            <SelectItem value="dm">达梦 (DM)</SelectItem>
            <SelectItem value="oceanbase">OceanBase (MySQL)</SelectItem>
            <SelectItem value="oceanbase-oracle">OceanBase (Oracle)</SelectItem>
            <SelectItem value="kingbase">人大金仓 (Kingbase)</SelectItem>
            <SelectItem value="gbase">南大通用 (GBase)</SelectItem>
            <SelectItem value="polardb">PolarDB</SelectItem>
            <SelectItem value="gaussdb">GaussDB</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sql-content">SQL 内容</Label>
        <textarea
          id="sql-content"
          className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="CREATE TABLE users ( id INT PRIMARY KEY, name VARCHAR(100), ... );"
          value={sql}
          onChange={(e) => onSqlChange(e.target.value)}
        />
      </div>
      {validationResult && (
        <div
          className={`flex items-start gap-2 rounded-md p-3 text-sm ${
            validationResult.success
              ? 'bg-green-50 text-green-700 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {validationResult.success ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <div>
            {validationResult.success ? (
              <span className="font-medium">校验通过</span>
            ) : (
              <>
                <span className="font-medium">校验失败</span>
                {validationResult.lineNumber && (
                  <span className="ml-2 text-muted-foreground">
                    (第 {validationResult.lineNumber} 行)
                  </span>
                )}
                <p className="mt-1">{validationResult.error}</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
