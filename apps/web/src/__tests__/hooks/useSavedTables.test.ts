import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSavedTables } from '@/hooks/useSavedTables';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '../utils/fakeIndexedDb';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { flushPromises } from '@/__tests__/utils/test-utils';

vi.mock('@/auth/AuthSessionProvider', () => ({
  useAuthSession: vi.fn(() => ({
    status: 'signed_out',
    configured: true,
    userId: null,
  })),
}));

const createState = (name: string): PersistedState => ({
  schemaName: '',
  tableName: name,
  tableComment: '测试',
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

describe('useSavedTables', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
  });

  it('should save and prevent duplicate by normalized name', async () => {
    const { result } = renderHook(() => useSavedTables());

    await act(async () => {
      const saveResult = await result.current.saveTable('Demo', createState('t1'));
      expect(saveResult.ok).toBe(true);
    });

    await act(async () => {
      const duplicate = await result.current.saveTable(' demo ', createState('t2'));
      expect(duplicate.ok).toBe(false);
      if (!duplicate.ok) {
        expect(duplicate.reason).toBe('duplicate');
      }
    });

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.savedTables).toHaveLength(1);
  });

  it('should rename and delete records', async () => {
    const { result } = renderHook(() => useSavedTables());

    await act(async () => {
      await result.current.saveTable('Alpha', createState('alpha'));
      await flushPromises();
    });

    const current = result.current.savedTables[0];
    expect(current?.name).toBe('Alpha');

    await act(async () => {
      const renameResult = await result.current.renameTable(current.normalizedName, 'Beta');
      expect(renameResult.ok).toBe(true);
      await flushPromises();
    });

    const renamed = result.current.savedTables[0];
    expect(renamed?.name).toBe('Beta');

    await act(async () => {
      const deleteResult = await result.current.deleteTable(renamed.normalizedName);
      expect(deleteResult.ok).toBe(true);
      await flushPromises();
    });

    expect(result.current.savedTables).toHaveLength(0);
  });

  it('should overwrite existing record', async () => {
    const { result } = renderHook(() => useSavedTables());

    await act(async () => {
      await result.current.saveTable('Gamma', createState('gamma'));
      await flushPromises();
    });

    const saved = result.current.savedTables[0];
    const load = await result.current.loadTable(saved.normalizedName);
    expect(load?.state.tableName).toBe('gamma');

    await act(async () => {
      const overwriteResult = await result.current.overwriteTable(
        saved.normalizedName,
        createState('gamma-updated'),
      );
      expect(overwriteResult.ok).toBe(true);
      await flushPromises();
    });

    const updated = await result.current.loadTable(saved.normalizedName);
    expect(updated?.state.tableName).toBe('gamma-updated');
  });

  it('should keep saved table order stable after overwrite', async () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(300);
    const { result } = renderHook(() => useSavedTables());

    await act(async () => {
      await result.current.saveTable('Alpha', createState('alpha'));
      await result.current.saveTable('Beta', createState('beta'));
      await flushPromises();
    });

    expect(result.current.savedTables.map((table) => table.name)).toEqual(['Beta', 'Alpha']);

    await act(async () => {
      const alpha = result.current.savedTables.find((table) => table.name === 'Alpha');
      expect(alpha).toBeDefined();
      if (!alpha) return;
      await result.current.overwriteTable(alpha.normalizedName, createState('alpha-updated'));
      await flushPromises();
    });

    expect(result.current.savedTables.map((table) => table.name)).toEqual(['Beta', 'Alpha']);
  });
});
