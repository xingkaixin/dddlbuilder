import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useDraftRecords } from '@/hooks/workspacePersistence/useDraftRecords';

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

const renderDraftRecords = () =>
  renderHook(() =>
    useDraftRecords({
      disabled: false,
      enqueuePersistence: vi.fn(),
      storage: {
        kind: 'ydoc',
        read: vi.fn(),
        readLocal: vi.fn(),
        update: vi.fn(),
        write: vi.fn(),
        cleanupLocal: vi.fn(),
        removeEverywhere: vi.fn(),
      },
    }),
  );

describe('useDraftRecords', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives folder and timestamp changes from the draft record', () => {
    vi.useFakeTimers();
    vi.setSystemTime(20);
    const { result } = renderDraftRecords();
    act(() => {
      result.current.replaceDrafts([
        {
          draftId: 'draft-1',
          record: { state: createState('users'), createdAt: 1, updatedAt: 10 },
        },
      ]);
    });

    act(() => result.current.moveDraftToFolder('draft-1', 'folder-1'));

    expect(result.current.draftSummaries).toEqual([
      expect.objectContaining({
        draftId: 'draft-1',
        folderId: 'folder-1',
        createdAt: 1,
        updatedAt: 20,
      }),
    ]);
  });

  it('updates the derived summary when a synchronized record is cached', () => {
    const { result } = renderDraftRecords();
    act(() => {
      result.current.cacheDraftRecord('draft-1', {
        state: createState('users'),
        createdAt: 1,
        updatedAt: 10,
      });
    });
    act(() => {
      result.current.cacheDraftRecord('draft-1', {
        state: createState('customers'),
        createdAt: 1,
        updatedAt: 11,
      });
    });

    expect(result.current.draftSummaries).toEqual([
      expect.objectContaining({ name: 'customers', updatedAt: 11 }),
    ]);
  });
});
