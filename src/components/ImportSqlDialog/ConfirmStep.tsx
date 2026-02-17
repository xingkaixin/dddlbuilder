import type { DatabaseType } from '@/types';
import type { ParsedResult } from '@/utils/SqlParser';

interface ConfirmStepProps {
  parsedResult: ParsedResult | null;
  previewFieldCount: number;
  selectedDbType: DatabaseType;
}

export function ConfirmStep({
  parsedResult,
  previewFieldCount,
  selectedDbType,
}: ConfirmStepProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-muted p-4 text-sm">
        <p className="font-medium">确认导入以下配置？</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground">
          <p>
            表名:{' '}
            <span className="text-foreground">
              {parsedResult?.tableName || '未命名'}
            </span>
          </p>
          <p>
            字段数: <span className="text-foreground">{previewFieldCount}</span>
          </p>
          <p>
            索引数:{' '}
            <span className="text-foreground">
              {parsedResult?.indexes.length || 0}
            </span>
          </p>
          <p>
            授权对象数:{' '}
            <span className="text-foreground">
              {parsedResult?.authObjects.length || 0}
            </span>
          </p>
          <p>
            数据库: <span className="text-foreground">{selectedDbType}</span>
          </p>
        </div>
        {(parsedResult?.authObjects.length || 0) > 0 && (
          <p className="mt-2 text-muted-foreground">
            授权对象: {parsedResult?.authObjects.join(', ')}
          </p>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        点击确认后，表结构将导入到当前工作区。
      </p>
    </div>
  );
}
