import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from '@/stores';

describe('indexStore', () => {
  beforeEach(() => {
    useEditorStore.getState().resetIndexState();
  });

  it('replaces and removes document indexes', () => {
    const indexes = [
      { id: '1', name: 'idx_users_id', fields: [], kind: 'index' as const },
      { id: '2', name: 'idx_users_email', fields: [], kind: 'unique_index' as const },
    ];
    useEditorStore.getState().setIndexes(indexes);
    useEditorStore.getState().removeIndex('1');

    expect(useEditorStore.getState().indexes).toEqual([indexes[1]]);
  });

  it('resets document indexes', () => {
    useEditorStore
      .getState()
      .setIndexes([{ id: '1', name: 'idx_users_id', fields: [], kind: 'index' }]);

    useEditorStore.getState().resetIndexState();

    expect(useEditorStore.getState().indexes).toEqual([]);
  });
});
