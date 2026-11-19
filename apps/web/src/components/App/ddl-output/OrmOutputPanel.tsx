import { useMemo } from 'react';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import type { ORMTarget } from '@ddlbuilder/ddl-core';
import { useTranslation } from 'react-i18next';
import { ORM_TARGET_OPTIONS } from '@/hooks/useOrmGeneration';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/select';
import {
  CopyOutputButton,
  DownloadOutputButton,
  OutputCode,
  OutputHeading,
} from './OutputPrimitives';
import type { CodeBlockLanguage } from '../SqlCodeBlock';

const ORM_LANGUAGE: Record<ORMTarget, CodeBlockLanguage> = {
  prisma: 'prisma',
  typeorm: 'typescript',
  drizzle: 'typescript',
  sqlalchemy: 'python',
  gorm: 'go',
  jpa: 'java',
};

const ORM_EXTENSION: Record<ORMTarget, string> = {
  prisma: 'prisma',
  typeorm: 'ts',
  drizzle: 'ts',
  sqlalchemy: 'py',
  gorm: 'go',
  jpa: 'java',
};

export function OrmOutputPanel({
  generateCode,
  dbType,
  target,
  onTargetChange,
  onCopy,
}: {
  generateCode: () => string;
  dbType: DatabaseType;
  target: ORMTarget;
  onTargetChange: (target: ORMTarget) => void;
  onCopy: () => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const code = useMemo(() => generateCode(), [generateCode]);

  const options = ORM_TARGET_OPTIONS.filter((option) =>
    dbType === 'sqlite' ? option.value === 'drizzle' : option.value !== 'drizzle',
  );

  return (
    <div className="relative flex flex-col">
      <OutputHeading
        title={t('ddlOutput.ormTitle')}
        description={t('ddlOutput.ormDesc')}
        actions={
          <div className="ml-auto flex items-center gap-1.5">
            <DownloadOutputButton code={code} filename={`schema.${ORM_EXTENSION[target]}`} />
            <CopyOutputButton
              copy={onCopy}
              label={t('ddlOutput.copyOrm')}
              tooltip={t('ddlOutput.copyOrmTip')}
            />
          </div>
        }
      />
      <div className="border-b border-primary/10 px-4 py-3.5">
        <div className="space-y-2">
          <Label htmlFor="orm-target">{t('ddlOutput.ormFramework')}</Label>
          <SearchableSelect
            id="orm-target"
            value={target}
            onValueChange={(value) => {
              const option = options.find((candidate) => candidate.value === value);

              if (option) onTargetChange(option.value);
            }}
            options={options}
            triggerClassName="h-9 rounded-md px-3 py-2 text-sm"
            emptyMessage={t('searchableSelect.empty')}
          />
        </div>
      </div>
      <OutputCode code={code || t('ddlOutput.emptyOrm')} language={ORM_LANGUAGE[target]} />
    </div>
  );
}
