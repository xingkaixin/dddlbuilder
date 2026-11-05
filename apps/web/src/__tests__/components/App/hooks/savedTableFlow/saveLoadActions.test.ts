import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { type PersistedState, normalizePersistedRows } from '@ddlbuilder/shared-types';
import { useSaveLoadActions } from '@/components/App/hooks/savedTableFlow/saveLoadActions';
import { buildSchemaStateSignature } from '@ddlbuilder/workspace-core';

// oxlint-disable-next-line anti-slop/no-module-mocking -- keep version-message lookup deterministic while testing saved-table actions.
vi.mock('@/utils/tableVersions', () => ({
  INITIAL_VERSION_MESSAGE_KEY: 'init',
}));

describe('useSaveLoadActions', () => {
  let saveDialog: any;
  let refreshTableVersions: any;
  let loadTable: any;
  let saveTable: any;
  let overwriteTable: any;
  let showToast: any;
  let onSaveSuccess: any;
  let onTableLoadStateChange: any;
  let buildPersistedState: any;
  let persistedState: PersistedState;
  let countTableVersions: any;
  let createTableVersion: any;

  beforeEach(() => {
    vi.clearAllMocks();
    saveDialog = {
      isOpen: false,
      data: { name: '' },
      openDialog: vi.fn().mockImplementation((d: any) => {
        saveDialog.data = d;
      }),
      closeDialog: vi.fn(),
      setError: vi.fn(),
    };
    refreshTableVersions = vi.fn();
    loadTable = vi.fn();
    saveTable = vi.fn();
    overwriteTable = vi.fn();
    showToast = vi.fn();
    onSaveSuccess = vi.fn();
    onTableLoadStateChange = vi.fn();
    persistedState = {
      schemaName: '',
      tableName: 'test',
      tableComment: '',
      dbType: 'mysql',
      sqlFormatMode: 'compact',
      rows: [],
      addCount: 10,
      indexes: [],
      authInput: '',
      authObjects: [],
    };
    buildPersistedState = vi.fn().mockReturnValue(persistedState);
    countTableVersions = vi.fn().mockResolvedValue(1);
    createTableVersion = vi.fn().mockResolvedValue(undefined);
  });

  const getHook = (overrides = {}) =>
    renderHook(() =>
      useSaveLoadActions({
        tableName: 'default_name',
        hasLoadedTable: false,
        canSaveCurrent: true,
        loadedTableSource: null,
        refreshTableVersions,
        saveDialog,
        buildPersistedState,
        loadTable,
        saveTable,
        overwriteTable,
        countTableVersions,
        createTableVersion,
        showToast,
        onSaveSuccess,
        onTableLoadStateChange,
        ...overrides,
      }),
    );

  it('resolveSavedTable restores matching saved-table draft', async () => {
    const savedState = {
      tableName: 'test_table',
      dbType: 'mysql',
      rows: [{ fieldName: 'id' }],
    };
    const draftState = {
      ...savedState,
      tableName: 'test_table_draft',
    };
    loadTable.mockResolvedValue({
      normalizedName: 'norm_test',
      name: 'test_table',
      // SAFETY: this fixture intentionally omits persisted fields irrelevant to draft matching.
      state: normalizePersistedRows(savedState as PersistedState),
    });

    const { result } = getHook({
      getSavedTableDraft: vi.fn().mockReturnValue({
        state: draftState,
        tableName: 'test_table',
        baseSignature: JSON.stringify(savedState),
        updatedAt: Date.now(),
      }),
    });

    let snapshot: Awaited<ReturnType<typeof result.current.resolveSavedTable>> = null;
    await act(async () => {
      // SAFETY: this fixture supplies only the saved-record identity used by draft matching.
      snapshot = await result.current.resolveSavedTable({
        normalizedName: 'norm_test',
        name: 'test_table',
      } as any);
    });

    expect(snapshot).toEqual({
      source: {
        kind: 'saved_table',
        normalizedName: 'norm_test',
        tableName: 'test_table',
        baseSignature: buildSchemaStateSignature(
          // SAFETY: this fixture is the persisted shape used to compute the saved-table signature.
          normalizePersistedRows(savedState as PersistedState),
        ),
      },
      state: draftState,
      version: 1,
    });
  });

  describe('跨版本升级后的已保存表草稿', () => {
    // SAFETY: this fixture intentionally models the legacy persisted enum strings before normalization.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the fixture intentionally omits current persisted fields while modeling legacy storage.
    const legacySavedState = {
      tableName: 'orders',
      dbType: 'mysql',
      rows: [
        {
          order: 1,
          fieldName: 'id',
          fieldType: 'bigint',
          fieldComment: '主键',
          nullable: '否',
          defaultKind: '自增',
          defaultValue: '',
          onUpdate: '无',
        },
      ],
    } as unknown as PersistedState;

    // 升级后已保存表经 savedTablesDb 读取入口归一化，baseSignature 仍是迁移前写入的原始 JSON
    const loadWithDraft = (draftState: PersistedState, baseSignature: string) => {
      const recordState = normalizePersistedRows(legacySavedState);
      loadTable.mockResolvedValue({
        normalizedName: 'orders',
        name: 'orders',
        state: recordState,
      });

      return getHook({
        getSavedTableDraft: vi.fn().mockReturnValue({
          state: draftState,
          tableName: 'orders',
          baseSignature,
          updatedAt: Date.now(),
        }),
      });
    };

    it('保留未保存的编辑，而不是回落到已保存版本', async () => {
      // SAFETY: normalizePersistedRows returns the current persisted shape before adding the draft-only field.
      const draftState = {
        ...normalizePersistedRows(legacySavedState),
        tableComment: '尚未保存的编辑',
      } as PersistedState;
      const { result } = loadWithDraft(draftState, JSON.stringify(legacySavedState));

      const snapshot = await act(() =>
        // SAFETY: this fixture only supplies the normalized lookup key for the draft test.
        result.current.resolveSavedTable({ normalizedName: 'orders' } as any),
      );

      expect(snapshot?.state).toBe(draftState);
    });

    it('基线确实变化时仍回落到已保存版本', async () => {
      // SAFETY: normalizePersistedRows returns the current persisted shape used as the stale draft baseline.
      const draftState = { ...normalizePersistedRows(legacySavedState) } as PersistedState;

      const staleBase = JSON.stringify({
        ...legacySavedState,
        rows: [{ ...legacySavedState.rows[0], fieldType: 'int' }],
      });
      const { result } = loadWithDraft(draftState, staleBase);

      const snapshot = await act(() =>
        // SAFETY: this fixture only supplies the normalized lookup key for the fallback test.
        result.current.resolveSavedTable({ normalizedName: 'orders' } as any),
      );

      expect(snapshot?.state).toEqual(normalizePersistedRows(legacySavedState));
    });
  });
});
