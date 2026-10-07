import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthIdentity } from '@/auth/AuthSessionProvider';
import { GlobalDialogs } from './containers/GlobalDialogs';
import type { AppDialogLayerModel } from './buildAppDialogLayerModel';
import { WebMcpChangeDialog } from '@/webmcp/WebMcpChangeDialog';
import { AuthDialogs } from '@/auth/AuthDialogs';
import { WorkspaceMigrationDialog } from './WorkspaceMigrationDialog';

const AISchemaPatchDialog = lazy(() =>
  import('./AISchemaPatchDialog').then((module) => ({ default: module.AISchemaPatchDialog })),
);
const AIIndexAdvisorDialog = lazy(() =>
  import('./AIIndexAdvisorDialog').then((module) => ({ default: module.AIIndexAdvisorDialog })),
);
const UserSettingsDialog = lazy(() =>
  import('./UserSettingsDialog').then((module) => ({ default: module.UserSettingsDialog })),
);

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
  // AI 补丁会话在关闭后仍需保留，首次打开后才挂载，之后保持挂载。
  const [aiPatchMounted, setAiPatchMounted] = useState(false);

  if (aiPatchProps.open && !aiPatchMounted) setAiPatchMounted(true);

  return (
    <>
      <AuthDialogs />
      <WorkspaceMigrationDialog />
      {model.userSettings.open && (
        <Suspense fallback={null}>
          <UserSettingsDialog {...model.userSettings} />
        </Suspense>
      )}
      <WebMcpChangeDialog model={model.webMcpDialog} />
      <GlobalDialogs {...globalDialogs} saveDialog={saveDialog} />

      {aiPatchMounted && (
        <Suspense fallback={null}>
          <AISchemaPatchDialog
            key={JSON.stringify([authSession.userId, authSession.workspaceId, aiPatchTargetKey])}
            {...aiPatchProps}
          />
        </Suspense>
      )}

      {indexAdvisor.open && (
        <Suspense fallback={null}>
          <AIIndexAdvisorDialog {...indexAdvisor} />
        </Suspense>
      )}

      <Suspense fallback={null}>
        {importVisible && <ImportSqlDialog {...importDialogProps} />}
      </Suspense>
    </>
  );
}
