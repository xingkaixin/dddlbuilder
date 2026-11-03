import { beforeEach, describe, expect, it } from 'vitest';
import { isWorkspaceTabDirty, useTabStore } from '@/stores/tabStore';
import { createPersistedState } from '@/__tests__/utils/testFactories';
import { buildSchemaStateSignature } from '@/utils/persistedStateSignature';
import type { PersistedState } from '@ddlbuilder/shared-types';

function resetTabStore() {
  useTabStore.setState({
    tabs: [],
    activeTabId: null,
  });
}

const createSnapshot = (name: string): PersistedState => createPersistedState({ tableName: name });

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
      store.addTab({ source, stateSnapshot: createSnapshot(source.tableId) }),
    );
    expect(ids[0]).not.toBe(ids[1]);
    expect(store.findTabBySource(sources[1])?.id).toBe(ids[1]);
    store.renameSavedTableTabs(sources[0], 'renamed', 'Renamed');
    expect(useTabStore.getState().tabs.map((tab) => tab.source)).toMatchObject([
      { tableName: 'Renamed' },
      { tableName: 'Shared' },
    ]);
    expect(store.findTabBySource(sources[0])?.id).toBe(ids[0]);
    store.closeTab(ids[0]);
    expect(store.findTabBySource(sources[1])?.stateSnapshot.tableName).toBe('second');
  });

  it('updates active tab snapshot and derives dirty state', () => {
    const state = useTabStore.getState();

    const id = state.addTab({
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
});
