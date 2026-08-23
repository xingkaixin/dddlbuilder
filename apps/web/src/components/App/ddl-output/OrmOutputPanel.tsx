import type { ORMTarget } from '@ddlbuilder/ddl-core';
import { useTranslation } from 'react-i18next';
import { ORM_TARGET_OPTIONS } from '@/hooks/useOrmGeneration';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/select';
import { CopyOutputButton, OutputCode, OutputHeading } from './OutputPrimitives';

export function OrmOutputPanel({
  code,
  target,
  onTargetChange,
  onCopy,
}: {
  code: string;
  target: ORMTarget;
  onTargetChange: (target: ORMTarget) => void;
  onCopy: () => Promise<boolean>;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative flex flex-col">
      <OutputHeading
        title={t('ddlOutput.ormTitle')}
        description={t('ddlOutput.ormDesc')}
        actions={
          <CopyOutputButton
            copy={onCopy}
            label={t('ddlOutput.copyOrm')}
            tooltip={t('ddlOutput.copyOrmTip')}
          />
        }
      />
      <div className="border-b border-primary/10 px-4 py-3.5">
        <div className="space-y-2">
          <Label htmlFor="orm-target">{t('ddlOutput.ormFramework')}</Label>
          <SearchableSelect
            id="orm-target"
            value={target}
            onValueChange={(value) => onTargetChange(value as ORMTarget)}
            options={ORM_TARGET_OPTIONS}
            triggerClassName="h-9 rounded-md px-3 py-2 text-sm"
            emptyMessage={t('searchableSelect.empty')}
          />
        </div>
      </div>
      <OutputCode code={code || t('ddlOutput.emptyOrm')} />
    </div>
  );
}
