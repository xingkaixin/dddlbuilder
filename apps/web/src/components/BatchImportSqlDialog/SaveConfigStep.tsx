import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { ConflictStrategy } from './types';

function RadioCard({
  value,
  checked,
  onChange,
  id,
  title,
  description,
}: {
  value: ConflictStrategy;
  checked: boolean;
  onChange: (v: ConflictStrategy) => void;
  id: string;
  title: string;
  description: string;
}) {
  return (
    <label
      htmlFor={id}
      aria-label={title}
      className="flex items-start space-x-2 rounded-md border p-3 hover:bg-muted/30 cursor-pointer"
    >
      <input
        id={id}
        type="radio"
        name="conflict-strategy"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-0.5 h-4 w-4 accent-primary"
      />
      <div className="space-y-0.5">
        <span className="text-sm font-medium">{title}</span>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </label>
  );
}

interface SaveConfigStepProps {
  folders: FolderTreeNode[];
  selectedFolderId: string | undefined;
  onFolderChange: (folderId: string | undefined) => void;
  conflictStrategy: ConflictStrategy;
  onConflictStrategyChange: (strategy: ConflictStrategy) => void;
  totalCount: number;
  newCount: number;
  conflictCount: number;
}

function flattenFolders(
  nodes: FolderTreeNode[],
  depth = 0,
): Array<{ id: string; name: string; depth: number }> {
  const result: Array<{ id: string; name: string; depth: number }> = [];
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, depth });
    if (node.children && node.children.length > 0) {
      result.push(...flattenFolders(node.children, depth + 1));
    }
  }
  return result;
}

export function SaveConfigStep({
  folders,
  selectedFolderId,
  onFolderChange,
  conflictStrategy,
  onConflictStrategyChange,
  totalCount,
  newCount,
  conflictCount,
}: SaveConfigStepProps) {
  const { t } = useTranslation();
  const flatFolders = flattenFolders(folders);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>{t('batchImportSql.targetFolder')}</Label>
        <Select
          value={selectedFolderId ?? 'ungrouped'}
          onValueChange={(v) => onFolderChange(v === 'ungrouped' ? undefined : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('batchImportSql.selectFolder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ungrouped">{t('batchImportSql.ungrouped')}</SelectItem>
            {flatFolders.map((folder) => (
              <SelectItem key={folder.id} value={folder.id}>
                <span style={{ paddingLeft: `${folder.depth * 12}px` }}>{folder.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label>{t('batchImportSql.conflictStrategy.label')}</Label>
        <div className="space-y-2">
          <RadioCard
            value="skip"
            checked={conflictStrategy === 'skip'}
            onChange={onConflictStrategyChange}
            id="skip"
            title={t('batchImportSql.conflictStrategy.skip')}
            description={t('batchImportSql.conflictStrategy.skipDesc')}
          />
          <RadioCard
            value="overwrite"
            checked={conflictStrategy === 'overwrite'}
            onChange={onConflictStrategyChange}
            id="overwrite"
            title={t('batchImportSql.conflictStrategy.overwrite')}
            description={t('batchImportSql.conflictStrategy.overwriteDesc')}
          />
          <RadioCard
            value="rename"
            checked={conflictStrategy === 'rename'}
            onChange={onConflictStrategyChange}
            id="rename"
            title={t('batchImportSql.conflictStrategy.rename')}
            description={t('batchImportSql.conflictStrategy.renameDesc')}
          />
        </div>
      </div>

      <div className="rounded-md bg-muted/50 p-4 text-sm space-y-1">
        <p className="font-medium">{t('batchImportSql.summaryTitle')}</p>
        <p className="text-muted-foreground">
          {t('batchImportSql.summaryTotal', { count: totalCount })}
        </p>
        <p className="text-muted-foreground">
          {t('batchImportSql.summaryNew', { count: newCount })}
        </p>
        {conflictCount > 0 && (
          <p className="text-muted-foreground">
            {t('batchImportSql.summaryConflict', {
              count: conflictCount,
              action: t(`batchImportSql.conflictStrategy.${conflictStrategy}Action`),
            })}
          </p>
        )}
      </div>
    </div>
  );
}
