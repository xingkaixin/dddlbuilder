import type { DatabaseType } from '@/types';
import type { ParsedResult } from '@/utils/SqlParser';
import { useTranslation } from 'react-i18next';

interface ConfirmStepProps {
  parsedResult: ParsedResult | null;
  previewFieldCount: number;
  selectedDbType: DatabaseType;
}

export function ConfirmStep({ parsedResult, previewFieldCount, selectedDbType }: ConfirmStepProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-muted p-4 text-sm">
        <p className="font-medium">{t('importSql.confirm.title')}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-muted-foreground">
          <p>
            {t('importSql.confirm.tableName')}:{' '}
            <span className="text-foreground">
              {parsedResult?.tableName || t('importSql.unnamed')}
            </span>
          </p>
          <p>
            {t('importSql.confirm.fieldCount')}:{' '}
            <span className="text-foreground">{previewFieldCount}</span>
          </p>
          <p>
            {t('importSql.confirm.indexCount')}:{' '}
            <span className="text-foreground">{parsedResult?.indexes.length || 0}</span>
          </p>
          <p>
            {t('importSql.confirm.authCount')}:{' '}
            <span className="text-foreground">{parsedResult?.authObjects.length || 0}</span>
          </p>
          <p>
            {t('importSql.confirm.database')}:{' '}
            <span className="text-foreground">{selectedDbType}</span>
          </p>
        </div>
        {(parsedResult?.authObjects.length || 0) > 0 && (
          <p className="mt-2 text-muted-foreground">
            {t('importSql.confirm.authObjects')}: {parsedResult?.authObjects.join(', ')}
          </p>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t('importSql.confirm.description')}</p>
    </div>
  );
}
