import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { AISchemaPatchPanel } from './AISchemaPatchPanel';
import { AIIndexAdvisorDialog } from './AIIndexAdvisorDialog';
import { GlobalDialogs } from './containers/GlobalDialogs';
import type { AppDialogLayerModel } from './buildAppDialogLayerModel';
import { WebMcpChangeDialog } from '@/webmcp/WebMcpChangeDialog';

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
  const { globalDialogs, aiPatch, indexAdvisor, importDialog } = model;
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
      <WebMcpChangeDialog model={model.webMcpDialog} />
      <GlobalDialogs {...globalDialogs} saveDialog={saveDialog} />

      {aiPatch.open && (
        <Dialog open={aiPatch.open} onOpenChange={aiPatch.onOpenChange}>
          <DialogContent className="flex max-h-[88vh] w-[min(1080px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0">
            <DialogTitle className="sr-only">{t('aiPatch.title')}</DialogTitle>
            <AISchemaPatchPanel
              dbType={aiPatch.dbType}
              currentState={aiPatch.currentState}
              templates={aiPatch.templates}
              onApplyChanges={aiPatch.onApplyChanges}
              onFocusChange={aiPatch.onFocusChange}
            />
          </DialogContent>
        </Dialog>
      )}

      {indexAdvisor.open && <AIIndexAdvisorDialog {...indexAdvisor} />}

      <Suspense fallback={null}>
        {importVisible && <ImportSqlDialog {...importDialogProps} />}
      </Suspense>
    </>
  );
}
