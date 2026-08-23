import { describe, expect, it, vi } from 'vitest';
import {
  toAppDialogModel,
  toAppShellModel,
  toAppWorkspaceModel,
} from '@/components/App/appViewModel';
import type { AppController } from '@/components/App/useAppController';

const createController = () => {
  const action = {};
  const actions = {
    aiCommentActions: action,
    indexAdvisor: action,
    folderActions: action,
    templateActions: action,
    reviewActions: action,
    shareAction: action,
    clearActions: action,
    savedTableFlow: action,
    workspaceTabs: action,
    tableTemplateActions: action,
    trashActions: action,
    aiPatchFlow: action,
    schemaActions: action,
    navigationActions: { handleOpenAIGenerateDialog: vi.fn() },
  };
  const domains = {
    editor: {},
    auth: {},
    sharding: {},
    animations: {},
    partition: {},
    tableOptions: {},
    reviewState: {},
  };
  const resources = {
    savedTableData: {},
    folderData: {},
    fieldTemplateData: {},
    tableTemplateData: {},
  };
  const workspace = {
    activeSource: {},
    activeTabId: 'tab-1',
    draftSummaries: [],
    handleCloseTab: vi.fn(),
    isLoadedDirty: false,
    isShareView: false,
    loadedTableName: null,
    loadedTableNormalizedName: null,
    moveDraftToFolder: vi.fn(),
    presentedTabs: [],
    recentDrafts: [],
    recentTables: [],
    shouldShowWorkspaceSkeleton: false,
    switchToTabById: vi.fn(),
    tablePresentations: new Map(),
    tabs: [],
    trashedDrafts: [],
    workspaceLabel: '',
    workspaceScope: { kind: 'anonymous' },
  };
  const schema = {
    aiGenerateExistingConfig: null,
    aiGenerateTemplates: [],
    availableFields: [],
    canSaveCurrent: false,
    currentPersistedState: {},
    dataTableToolbarLeft: null,
    filledRowCount: 0,
    handleDbTypeChange: vi.fn(),
    handleSaveCurrent: vi.fn(),
    handleTableNameChange: vi.fn(),
    handleViewCurrentVersionHistory: vi.fn(),
    normalizedFields: [],
    qualifiedTableName: '',
    schemaLintIssues: [],
    tableDiff: null,
  };

  return {
    actions,
    domains,
    resources,
    workspace,
    schema,
    output: {},
    dialogs: {},
    celebration: {},
  } as unknown as AppController;
};

describe('appViewModel', () => {
  it('只向工作区模型暴露工作区所需数据', () => {
    const model = toAppWorkspaceModel(createController());

    expect(model.resources).not.toHaveProperty('fieldTemplateData');
    expect(model.workspace).not.toHaveProperty('workspaceScope');
    expect(model.schema).not.toHaveProperty('currentPersistedState');
    expect(model.actions).not.toHaveProperty('aiPatchFlow');
  });

  it('只向对话框模型暴露对话框所需领域和命令', () => {
    const model = toAppDialogModel(createController());

    expect(Object.keys(model.domains)).toEqual(['editor', 'tableOptions']);
    expect(model.actions).not.toHaveProperty('reviewActions');
    expect(model.workspace).toEqual(
      expect.objectContaining({
        isShareView: false,
        workspaceScope: { kind: 'anonymous' },
      }),
    );
  });

  it('壳层模型只保留路由决策所需信息', () => {
    const controller = createController();
    const model = toAppShellModel(controller);

    expect(model).toEqual({
      tabs: [],
      isShareView: false,
      openAIGenerateDialog: controller.actions.navigationActions.handleOpenAIGenerateDialog,
    });
  });
});
