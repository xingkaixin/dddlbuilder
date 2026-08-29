import { beforeEach, describe, expect, it } from 'vitest';
import { isWorkspaceTabDirty, useTabStore } from '@/stores/tabStore';
import { buildSchemaStateSignature } from '@/utils/persistedStateSignature';
import type { PersistedState } from '@ddlbuilder/shared-types';

function resetTabStore() {
  useTabStore.setState({
    tabs: [],
    activeTabId: null,
  });
}

const createSnapshot = (name: string): PersistedState => ({
  tableName: name,
  tableComment: '',
  rows: [],
  indexes: [],
  foreignKeys: [],
});

describe('tabStore', () => {
  beforeEach(() => {
    resetTabStore();
  });

  it('keeps same-name tables in separate tabs and renames only the selected ID', () => {
    const sources = ['first', 'second'].map((tableId) => ({
      kind: 'saved_table' as const,
      tableId,
      normalizedName: 'shared',
      tableName: 'Shared',
      baseSignature: 'base',
    }));
    const store = useTabStore.getState();
    const ids = sources.map((source) =>
      store.addTab({ title: 'Shared', source, stateSnapshot: createSnapshot(source.tableId) }),
    );
    expect(ids[0]).not.toBe(ids[1]);
    expect(store.findTabBySource(sources[1])?.id).toBe(ids[1]);
    store.renameSavedTableTabs(sources[0], 'renamed', 'Renamed');
    expect(useTabStore.getState().tabs.map((tab) => tab.title)).toEqual(['Renamed', 'Shared']);
    expect(store.findTabBySource(sources[0])?.id).toBe(ids[0]);
    store.closeTab(ids[0]);
    expect(store.findTabBySource(sources[1])?.stateSnapshot.tableName).toBe('second');
  });

  it('adds a tab and activates it', () => {
    const state = useTabStore.getState();
    const id = state.addTab({
      title: '草稿 1',
      source: { kind: 'draft', draftId: 'draft-1' },
      stateSnapshot: createSnapshot('t1'),
    });

    const current = useTabStore.getState();
    expect(current.tabs).toHaveLength(1);
    expect(current.tabs[0].title).toBe('草稿 1');
    expect(current.activeTabId).toBe(id);
  });

  it('activates a tab', () => {
    const state = useTabStore.getState();
    const id1 = state.addTab({
      title: 'Tab 1',
      source: { kind: 'draft', draftId: 'd1' },
      stateSnapshot: createSnapshot('t1'),
    });
    state.addTab({
      title: 'Tab 2',
      source: { kind: 'draft', draftId: 'd2' },
      stateSnapshot: createSnapshot('t2'),
    });

    useTabStore.getState().activateTab(id1);
    expect(useTabStore.getState().activeTabId).toBe(id1);
  });

  it('closes a tab and activates the right neighbor', () => {
    const state = useTabStore.getState();
    state.addTab({
      title: 'Tab 1',
      source: { kind: 'draft', draftId: 'd1' },
      stateSnapshot: createSnapshot('t1'),
    });
    const id2 = state.addTab({
      title: 'Tab 2',
      source: { kind: 'draft', draftId: 'd2' },
      stateSnapshot: createSnapshot('t2'),
    });
    const id3 = state.addTab({
      title: 'Tab 3',
      source: { kind: 'draft', draftId: 'd3' },
      stateSnapshot: createSnapshot('t3'),
    });

    useTabStore.getState().closeTab(id2);
    const current = useTabStore.getState();
    expect(current.tabs).toHaveLength(2);
    expect(current.activeTabId).toBe(id3);
  });

  it('closes the last tab and activates the left neighbor', () => {
    const state = useTabStore.getState();
    const id1 = state.addTab({
      title: 'Tab 1',
      source: { kind: 'draft', draftId: 'd1' },
      stateSnapshot: createSnapshot('t1'),
    });
    state.addTab({
      title: 'Tab 2',
      source: { kind: 'draft', draftId: 'd2' },
      stateSnapshot: createSnapshot('t2'),
    });

    useTabStore.getState().closeTab(id1);
    const current = useTabStore.getState();
    expect(current.tabs).toHaveLength(1);
    expect(current.activeTabId).toBe(current.tabs[0].id);
  });

  it('closing inactive tab does not change active tab', () => {
    const state = useTabStore.getState();
    const id1 = state.addTab({
      title: 'Tab 1',
      source: { kind: 'draft', draftId: 'd1' },
      stateSnapshot: createSnapshot('t1'),
    });
    state.addTab({
      title: 'Tab 2',
      source: { kind: 'draft', draftId: 'd2' },
      stateSnapshot: createSnapshot('t2'),
    });

    useTabStore.getState().closeTab(id1);
    const current = useTabStore.getState();
    expect(current.activeTabId).not.toBe(id1);
    expect(current.tabs).toHaveLength(1);
  });

  it('updates active tab snapshot and derives dirty state', () => {
    const state = useTabStore.getState();
    const id = state.addTab({
      title: 'Tab 1',
      source: {
        kind: 'saved_table',
        normalizedName: 'old',
        tableName: 'Old',
        baseSignature: buildSchemaStateSignature(createSnapshot('old')),
      },
      stateSnapshot: createSnapshot('old'),
    });

    useTabStore.getState().updateActiveTabSnapshot(createSnapshot('new'));
    const current = useTabStore.getState();
    const tab = current.tabs.find((t) => t.id === id);
    expect(tab).toBeDefined();
    expect(tab?.stateSnapshot.tableName).toBe('new');
    expect(tab && isWorkspaceTabDirty(tab)).toBe(true);
  });

  it('hydrates a background tab by id without changing the active tab', () => {
    const state = useTabStore.getState();
    const backgroundId = state.addTab({
      title: 'Background',
      source: { kind: 'draft', draftId: 'loading' },
      stateSnapshot: createSnapshot('placeholder'),
      isLoading: true,
    });
    const activeId = state.addTab({
      title: 'Active',
      source: { kind: 'draft', draftId: 'active' },
      stateSnapshot: createSnapshot('active'),
    });
    const source = {
      kind: 'saved_table' as const,
      normalizedName: 'loaded',
      tableName: 'Loaded',
      baseSignature: 'loaded-signature',
    };

    useTabStore.getState().hydrateTab(backgroundId, source, createSnapshot('loaded'));

    const current = useTabStore.getState();
    expect(current.activeTabId).toBe(activeId);
    expect(current.tabs.find((tab) => tab.id === backgroundId)).toMatchObject({
      source,
      isLoading: false,
      stateSnapshot: { tableName: 'loaded' },
    });
  });

  it('does nothing when updating snapshot with no active tab', () => {
    useTabStore.setState({ tabs: [], activeTabId: null });
    useTabStore.getState().updateActiveTabSnapshot(createSnapshot('new'));
    expect(useTabStore.getState().tabs).toHaveLength(0);
  });

  it('updates active tab title', () => {
    const state = useTabStore.getState();
    const id = state.addTab({
      title: 'Old',
      source: { kind: 'draft', draftId: 'd1' },
      stateSnapshot: createSnapshot('t1'),
    });

    useTabStore.getState().updateDraftTitle(id, 'New');
    const tab = useTabStore.getState().tabs.find((t) => t.id === id);
    expect(tab).toBeDefined();
    expect(tab?.title).toBe('New');
  });

  it('does not derive a saved table title from draft edits', () => {
    const state = useTabStore.getState();
    const id = state.addTab({
      title: 'Saved users',
      source: {
        kind: 'saved_table',
        normalizedName: 'users',
        tableName: 'Saved users',
        baseSignature: 'base',
      },
      stateSnapshot: createSnapshot('users'),
    });

    useTabStore.getState().updateDraftTitle(id, 'Edited table name');

    expect(useTabStore.getState().getTabById(id)?.title).toBe('Saved users');
  });

  it('updates active tab source', () => {
    const state = useTabStore.getState();
    const id = state.addTab({
      title: 'Tab 1',
      source: { kind: 'draft', draftId: 'd1' },
      stateSnapshot: createSnapshot('t1'),
    });

    const newSource = {
      kind: 'saved_table' as const,
      normalizedName: 'users',
      tableName: 'users',
      baseSignature: 'users-signature',
    };
    useTabStore.getState().updateActiveTabSource(newSource);
    const tab = useTabStore.getState().tabs.find((t) => t.id === id);
    expect(tab).toBeDefined();
    expect(tab?.source).toEqual(newSource);
  });

  it('finds tab by source (draft)', () => {
    const state = useTabStore.getState();
    const id = state.addTab({
      title: 'Tab 1',
      source: { kind: 'draft', draftId: 'd1' },
      stateSnapshot: createSnapshot('t1'),
    });

    const found = useTabStore.getState().findTabBySource({ kind: 'draft', draftId: 'd1' });
    expect(found?.id).toBe(id);

    const notFound = useTabStore.getState().findTabBySource({ kind: 'draft', draftId: 'd2' });
    expect(notFound).toBeUndefined();
  });

  it('finds tab by source (saved)', () => {
    const state = useTabStore.getState();
    state.addTab({
      title: 'Tab 1',
      source: {
        kind: 'saved_table',
        normalizedName: 'users',
        tableName: 'users',
        baseSignature: 'users-signature',
      },
      stateSnapshot: createSnapshot('t1'),
    });

    const found = useTabStore.getState().findTabBySource({
      kind: 'saved_table',
      normalizedName: 'users',
      tableName: 'users',
      baseSignature: 'users-signature',
    });
    expect(found).toBeDefined();

    const notFound = useTabStore.getState().findTabBySource({
      kind: 'saved_table',
      normalizedName: 'orders',
      tableName: 'orders',
      baseSignature: 'orders-signature',
    });
    expect(notFound).toBeUndefined();
  });

  it('getActiveTab returns the active tab', () => {
    const state = useTabStore.getState();
    const id = state.addTab({
      title: 'Tab 1',
      source: { kind: 'draft', draftId: 'd1' },
      stateSnapshot: createSnapshot('t1'),
    });

    expect(useTabStore.getState().getActiveTab()?.id).toBe(id);
  });

  it('getActiveTab returns undefined when no active tab', () => {
    useTabStore.setState({ tabs: [], activeTabId: null });
    expect(useTabStore.getState().getActiveTab()).toBeUndefined();
  });

  it('renames the saved table title and source without replacing its tab or edits', () => {
    const state = useTabStore.getState();
    const id = state.addTab({
      title: 'Old',
      source: {
        kind: 'saved_table',
        normalizedName: 'old',
        tableName: 'Old',
        baseSignature: 'base',
      },
      stateSnapshot: createSnapshot('t1'),
    });
    const snapshot = state.getActiveTab()?.stateSnapshot;

    useTabStore.getState().renameSavedTableTabs('old', 'new', 'New');
    const tab = useTabStore.getState().tabs[0];
    expect(tab).toMatchObject({
      id,
      title: 'New',
      source: {
        kind: 'saved_table',
        normalizedName: 'new',
        tableName: 'New',
        baseSignature: 'base',
      },
    });
    expect(tab.stateSnapshot).toBe(snapshot);
  });

  it('renaming a saved table does not affect draft tabs', () => {
    const state = useTabStore.getState();
    state.addTab({
      title: 'Old',
      source: { kind: 'draft', draftId: 'd1' },
      stateSnapshot: createSnapshot('t1'),
    });

    useTabStore.getState().renameSavedTableTabs('d1', 'new', 'New');
    const tab = useTabStore.getState().tabs[0];
    expect(tab.title).toBe('Old');
  });
});
