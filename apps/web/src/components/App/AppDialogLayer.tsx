import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { AISchemaPatchDialog } from './AISchemaPatchDialog';
import { useAuthIdentity } from '@/auth/AuthSessionProvider';
import { AIIndexAdvisorDialog } from './AIIndexAdvisorDialog';
import { GlobalDialogs } from './containers/GlobalDialogs';
import type { AppDialogLayerModel } from './buildAppDialogLayerModel';
import { WebMcpChangeDialog } from '@/webmcp/WebMcpChangeDialog';
import { AuthDialogs } from '@/auth/AuthDialogs';
import { WorkspaceMigrationDialog } from './WorkspaceMigrationDialog';
import { UserSettingsDialog } from './UserSettingsDialog';

const ImportSqlDialog = lazy(() =>
  import('@/components/ImportSqlDialog').then((module) => ({
    default: module.ImportSqlDialog,
  })),
);

interface AppDialogLayerProps {
  model: AppDialogLayerModel;
}

export function AppDialogLayer({ model }: AppDialogLayerProps) {
  const { t } = useTranslation();
  const authSession = useAuthIdentity();
  const { globalDialogs, aiPatch, indexAdvisor, importDialog } = model;
  const { targetKey: aiPatchTargetKey, ...aiPatchProps } = aiPatch;
  const objectLabel = t(
    model.saveObjectType === 'view'
      ? 'dialogs.save.objectLabels.view'
      : 'dialogs.save.objectLabels.table',
  );
  const saveDialog = {
    ...globalDialogs.saveDialog,
    title: t(model.saveDialogIsUpdate ? 'dialogs.save.updateTitle' : 'dialogs.save.createTitle', {
      object: objectLabel,
    }),
    description: t(
      model.saveDialogIsUpdate
        ? 'dialogs.save.updateDescription'
        : 'dialogs.save.createDescription',
      { object: objectLabel },
    ),
  };
  const { visible: importVisible, ...importDialogProps } = importDialog;

  return (
    <>
      <AuthDialogs />
      <WorkspaceMigrationDialog />
      {model.userSettings.open && <UserSettingsDialog {...model.userSettings} />}
      <WebMcpChangeDialog model={model.webMcpDialog} />
      <GlobalDialogs {...globalDialogs} saveDialog={saveDialog} />

      <AISchemaPatchDialog
        key={JSON.stringify([authSession.userId, authSession.workspaceId, aiPatchTargetKey])}
        {...aiPatchProps}
      />

      {indexAdvisor.open && <AIIndexAdvisorDialog {...indexAdvisor} />}

      <Suspense fallback={null}>
        {importVisible && <ImportSqlDialog {...importDialogProps} />}
      </Suspense>
    </>
  );
}
