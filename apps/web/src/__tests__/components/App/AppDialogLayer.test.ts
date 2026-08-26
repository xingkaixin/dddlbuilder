import { describe, expect, it } from 'vitest';
import { hasOpenAppDialog, shouldSkipAppDialogLayerRender } from '@/components/App/AppDialogLayer';
import type { AppDialogLayerModel } from '@/components/App/useAppController';

const createClosedModel = (): AppDialogLayerModel =>
  ({
    webMcpDialog: { request: null },
    actions: {
      indexAdvisor: { open: false },
      folderActions: { isFolderDialogOpen: false, isDeleteFolderDialogOpen: false },
      templateActions: { isTemplateManagerOpen: false, isCreateTemplateDialogOpen: false },
      tableTemplateActions: { isManagerOpen: false, isCreateDialogOpen: false },
      trashActions: { isEmptyTrashDialogOpen: false },
    },
    domains: {
      ui: {
        isClearDialogOpen: false,
        isSaveDialogOpen: false,
        isRenameDialogOpen: false,
        isDeleteDialogOpen: false,
        isDiffDialogOpen: false,
        versionHistoryTarget: null,
        timelinePlayerTarget: null,
        isReviewHistoryOpen: false,
        isAIGenerateDialogOpen: false,
        isStorageEstimatorOpen: false,
        isMockDataDialogOpen: false,
      },
    },
    visibility: {
      isImportDialogOpen: false,
      isErDialogOpen: false,
      isAISchemaPatchOpen: false,
    },
  }) as AppDialogLayerModel;

describe('AppDialogLayer visibility', () => {
  it('reports when every dialog is closed', () => {
    expect(hasOpenAppDialog(createClosedModel())).toBe(false);
  });

  it('mounts when a dialog becomes visible', () => {
    const model = createClosedModel();
    model.domains.ui.isSaveDialogOpen = true;

    expect(hasOpenAppDialog(model)).toBe(true);
  });

  it('mounts for externally staged WebMCP changes', () => {
    const model = createClosedModel();
    model.webMcpDialog.request = { changeSet: {} } as never;

    expect(hasOpenAppDialog(model)).toBe(true);
  });

  it('skips unrelated model updates while closed and resumes before opening', () => {
    const previous = createClosedModel();
    const next = createClosedModel();

    expect(shouldSkipAppDialogLayerRender({ model: previous }, { model: next })).toBe(true);

    next.visibility.isErDialogOpen = true;
    expect(shouldSkipAppDialogLayerRender({ model: previous }, { model: next })).toBe(false);
  });
});
