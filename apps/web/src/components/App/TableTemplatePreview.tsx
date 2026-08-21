import { Database, KeyRound, ListTree, Settings2 } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import type { TableBlueprint } from '@/hooks/useTableTemplates';
import { useTranslation } from 'react-i18next';

interface TableTemplatePreviewProps {
  blueprint: TableBlueprint;
}

export function TableTemplatePreview({ blueprint }: TableTemplatePreviewProps) {
  const { t } = useTranslation();
  const tableConfigCount = [
    blueprint.tableMiscConfig?.enabled,
    blueprint.mysqlPartitionConfig?.enabled,
    blueprint.citusShardingConfig,
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-md border p-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Database className="h-3.5 w-3.5" />
            {t('tableTemplate.preview.dbType')}
          </div>
          <div className="mt-1 text-sm font-medium">{blueprint.dbType}</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ListTree className="h-3.5 w-3.5" />
            {t('tableTemplate.preview.fields')}
          </div>
          <div className="mt-1 text-sm font-medium">{blueprint.rows.length}</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" />
            {t('tableTemplate.preview.indexes')}
          </div>
          <div className="mt-1 text-sm font-medium">{blueprint.indexes.length}</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Settings2 className="h-3.5 w-3.5" />
            {t('tableTemplate.preview.tableConfigs')}
          </div>
          <div className="mt-1 text-sm font-medium">{tableConfigCount}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">{t('tableTemplate.preview.fieldList')}</div>
        <div className="max-h-40 overflow-y-auto rounded-md border">
          {blueprint.rows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b px-3 py-2 text-sm last:border-b-0"
            >
              <div className="truncate font-medium">{row.fieldName}</div>
              <div className="truncate text-muted-foreground">{row.fieldType}</div>
            </div>
          ))}
        </div>
      </div>

      {blueprint.indexes.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">{t('tableTemplate.preview.indexList')}</div>
          <div className="flex flex-wrap gap-1.5">
            {blueprint.indexes.map((index) => (
              <Badge
                key={index.id}
                variant={index.unique || index.isPrimary ? 'default' : 'outline'}
              >
                {index.name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        {t('tableTemplate.preview.excluded')}
      </div>
    </div>
  );
}
