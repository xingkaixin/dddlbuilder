import { LazyDialogBoundary } from './LazyDialogBoundary';
import { lazy, Suspense, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthDialog, useAuthIdentity } from '@/auth/AuthSessionProvider';
import { GlobalDialogs } from './containers/GlobalDialogs';
import type { AppDialogLayerModel } from './buildAppDialogLayerModel';

const AuthDialogs = lazy(() =>
  import('@/auth/AuthDialogs').then((module) => ({ default: module.AuthDialogs })),
);
const WorkspaceMigrationDialog = lazy(() =>
  import('./WorkspaceMigrationDialog').then((module) => ({
    default: module.WorkspaceMigrationDialog,
  })),
);
const WebMcpChangeDialog = lazy(() =>
  import('@/webmcp/WebMcpChangeDialog').then((module) => ({
    default: module.WebMcpChangeDialog,
  })),
);
const CommandPalette = lazy(() =>
  import('./CommandPalette').then((module) => ({ default: module.CommandPalette })),
);
const FieldStandardsDialog = lazy(() =>
  import('./field-standards/FieldStandardsDialog').then((module) => ({
    default: module.FieldStandardsDialog,
  })),
);
const AISchemaPatchDialog = lazy(() =>
  import('./AISchemaPatchDialog').then((module) => ({ default: module.AISchemaPatchDialog })),
);
const AIIndexAdvisorDialog = lazy(() =>
  import('./AIIndexAdvisorDialog').then((module) => ({ default: module.AIIndexAdvisorDialog })),
);

const ImportSqlDialog = lazy(() =>
  import('@/components/ImportSqlDialog').then((module) => ({
    default: module.ImportSqlDialog,
  })),
);

interface AppDialogLayerProps {
  model: AppDialogLayerModel;
}

const mountOnceReducer = (_mounted: boolean, _event: 'opened') => true;

const hasAuthCallbackQuery = () => {
  if (typeof window === 'undefined') return false;
  const action = new URLSearchParams(window.location.search).get('auth_action');

  return action === 'verify-email' || action === 'reset-password';
};

export function AppDialogLayer({ model }: AppDialogLayerProps) {
  const { t } = useTranslation();
  const authSession = useAuthIdentity();
  const authDialog = useAuthDialog();
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
  const [aiPatchMounted, dispatchAiPatchMount] = useReducer(mountOnceReducer, false);

  const [authDialogsMounted, dispatchAuthDialogsMount] = useReducer(
    mountOnceReducer,
    false,
    hasAuthCallbackQuery,
  );

  if (aiPatchProps.open && !aiPatchMounted) dispatchAiPatchMount('opened');

  if (authDialog.authDialogOpen && !authDialogsMounted) dispatchAuthDialogsMount('opened');

  return (
    <>
      {authDialogsMounted && (
        <Suspense fallback={null}>
          <AuthDialogs />
        </Suspense>
      )}
      {authSession.status === 'signed_in' && (
        <Suspense fallback={null}>
          <WorkspaceMigrationDialog />
        </Suspense>
      )}
      {model.webMcpDialog?.request && model.webMcpDialog.mode && (
        <LazyDialogBoundary onDismiss={model.webMcpDialog.onCancel}>
          <WebMcpChangeDialog model={model.webMcpDialog} />
        </LazyDialogBoundary>
      )}
      {model.commandPalette.open && (
        <LazyDialogBoundary onDismiss={() => model.commandPalette.onOpenChange(false)}>
          <CommandPalette {...model.commandPalette} />
        </LazyDialogBoundary>
      )}
      {model.fieldStandards.open && (
        <LazyDialogBoundary onDismiss={model.fieldStandards.onClose}>
          <FieldStandardsDialog onClose={model.fieldStandards.onClose} />
        </LazyDialogBoundary>
      )}
      <GlobalDialogs {...globalDialogs} saveDialog={saveDialog} />

      {aiPatchMounted && (
        <LazyDialogBoundary
          open={aiPatchProps.open}
          onDismiss={() => aiPatchProps.onOpenChange(false)}
        >
          <AISchemaPatchDialog
            key={JSON.stringify([authSession.userId, authSession.workspaceId, aiPatchTargetKey])}
            {...aiPatchProps}
          />
        </LazyDialogBoundary>
      )}

      {indexAdvisor.open && (
        <LazyDialogBoundary onDismiss={() => indexAdvisor.onOpenChange(false)}>
          <AIIndexAdvisorDialog {...indexAdvisor} />
        </LazyDialogBoundary>
      )}

      {importVisible && (
        <LazyDialogBoundary onDismiss={() => importDialogProps.onOpenChange(false)}>
          <ImportSqlDialog {...importDialogProps} />
        </LazyDialogBoundary>
      )}
    </>
  );
}
