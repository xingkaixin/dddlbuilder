import type { DatabaseType } from '@ddlbuilder/shared-types';
import { useTranslation } from 'react-i18next';
import {
  CopyOutputButton,
  DownloadOutputButton,
  OutputCode,
  OutputHeading,
} from './OutputPrimitives';

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
          <div className="ml-auto flex items-center gap-1.5">
            <DownloadOutputButton code={code} filename={`dcl-${dbType}.sql`} />
            <CopyOutputButton
              copy={onCopy}
              label={t('ddlOutput.copyDcl')}
              tooltip={t('ddlOutput.copyDclTip')}
            />
          </div>
        }
      />
      <OutputCode code={code || t('ddlOutput.emptyDcl')} />
    </div>
  );
}
