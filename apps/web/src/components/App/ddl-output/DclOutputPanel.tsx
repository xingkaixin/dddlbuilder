import type { DatabaseType } from '@ddlbuilder/shared-types';
import { useTranslation } from 'react-i18next';
import { CopyOutputButton, OutputCode, OutputHeading } from './OutputPrimitives';

export function DclOutputPanel({
  code,
  dbType,
  onCopy,
}: {
  code: string;
  dbType: DatabaseType;
  onCopy: () => Promise<boolean>;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative flex flex-col">
      <OutputHeading
        title={t('ddlOutput.dclTitle')}
        description={t('ddlOutput.dclDesc')}
        dbType={dbType}
        actions={
          <CopyOutputButton
            copy={onCopy}
            label={t('ddlOutput.copyDcl')}
            tooltip={t('ddlOutput.copyDclTip')}
          />
        }
      />
      <OutputCode code={code || t('ddlOutput.emptyDcl')} />
    </div>
  );
}
