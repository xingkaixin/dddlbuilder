import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useWorkspaceTabActions } from '@/components/App/hooks/useWorkspaceTabActions';
import { useTabStore } from '@/stores';

const mocks = vi.hoisted(() => ({
  applySavedState: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('@/components/App/applySavedState', () => ({
  applySavedState: mocks.applySavedState,
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

const createState = (tableName: string): PersistedState => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 1,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

const createParams = () => {
  const existingTab = {
    id: 'tab-existing',
    title: 'Alpha',
    source: {
      kind: 'saved_table' as const,
      normalizedName: 'alpha',
      tableName: 'Alpha',
      baseSignature: 'signature',
    },
    stateSnapshot: createState('Alpha'),
  };
  return {
    tabs: {
      tabs: [existingTab],
      addTab: vi.fn(() => 'tab-new'),
      activateTab: vi.fn(),
      findTabBySource: vi.fn(() => undefined),
      getActiveTab: vi.fn(),
      hydrateTab: vi.fn(),
      flushActiveTab: vi.fn(),
      showTab: vi.fn(),
      switchToTab: vi.fn(),
      closeTab: vi.fn(),
    },
    setSavedTablesDrawerOpen: vi.fn(),
    buildPersistedState: vi.fn(() => createState('current')),
    loadSavedTable: vi.fn(async () => null),
    draftSummaries: [],
    getDraftState: vi.fn(() => null),
    selectWorkspaceSnapshot: vi.fn(),
    setWorkspaceSnapshot: vi.fn(),
    createDraft: vi.fn((_draftId: string, state: PersistedState) => state.tableName || '新表'),
    deleteDraftById: vi.fn(),
    existingTab,
  };
};

describe('useWorkspaceTabActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTabStore.setState({ tabs: [], activeTabId: null });
  });

  it('保存表加载完成前标签失焦时把结果写入原标签且不改当前编辑器', async () => {
    const params = createParams();
    params.loadSavedTable.mockResolvedValue({
      source: {
        kind: 'saved_table',
        normalizedName: 'loaded',
        tableName: 'Loaded',
        baseSignature: 'loaded-signature',
      },
      state: createState('Loaded'),
      version: 1,
    });
    useTabStore.setState({ activeTabId: 'tab-other' });
    const { result } = renderHook(() => useWorkspaceTabActions(params));

    await act(async () => {
      await result.current.handleSelectSavedTable({
        normalizedName: 'loaded',
        name: 'Loaded',
        dbType: 'mysql',
        fieldCount: 1,
        createdAt: 1,
        updatedAt: 1,
      });
    });

    expect(params.tabs.hydrateTab).toHaveBeenCalledWith(
      'tab-new',
      expect.objectContaining({ normalizedName: 'loaded' }),
      expect.objectContaining({ tableName: 'Loaded' }),
    );
    expect(mocks.applySavedState).not.toHaveBeenCalled();
    expect(params.selectWorkspaceSnapshot).not.toHaveBeenCalled();
  });

  it('选择已经打开的保存表时只切换标签，不重复加载', async () => {
    const params = createParams();
    params.tabs.findTabBySource.mockReturnValue(params.existingTab);
    const { result } = renderHook(() => useWorkspaceTabActions(params));

    await act(async () => {
      await result.current.handleSelectSavedTable({
        normalizedName: 'alpha',
        name: 'Alpha',
        dbType: 'mysql',
        fieldCount: 1,
        createdAt: 1,
        updatedAt: 1,
      });
    });

    expect(params.tabs.flushActiveTab).not.toHaveBeenCalled();
    expect(params.tabs.switchToTab).toHaveBeenCalledWith(params.existingTab);
    expect(params.loadSavedTable).not.toHaveBeenCalled();
  });

  it('选择草稿时创建标签，并让工作区选择与编辑器状态同步', () => {
    const params = createParams();
    const draftState = createState('Draft A');
    params.getDraftState.mockReturnValue(draftState);
    params.draftSummaries.push({
      draftId: 'draft-a',
      name: '草稿 A',
      dbType: 'mysql',
      fieldCount: 0,
      createdAt: 1,
      updatedAt: 2,
    });
    const { result } = renderHook(() => useWorkspaceTabActions(params));

    act(() => result.current.handleSelectDraft('draft-a'));

    expect(params.tabs.addTab).toHaveBeenCalledWith({
      title: '草稿 A',
      source: { kind: 'draft', draftId: 'draft-a' },
      stateSnapshot: draftState,
    });
    expect(mocks.applySavedState).toHaveBeenCalledWith(draftState);
    expect(params.selectWorkspaceSnapshot).toHaveBeenCalledWith(
      { kind: 'draft', draftId: 'draft-a' },
      draftState,
    );
  });

  it('删除草稿时同时关闭对应标签', () => {
    const params = createParams();
    params.tabs.findTabBySource.mockReturnValue({
      ...params.existingTab,
      source: { kind: 'draft', draftId: 'draft-a' },
    });
    const { result } = renderHook(() => useWorkspaceTabActions(params));

    act(() => result.current.handleDeleteDraft('draft-a'));

    expect(params.deleteDraftById).toHaveBeenCalledWith('draft-a');
    expect(params.tabs.closeTab).toHaveBeenCalledWith('tab-existing');
  });
});
