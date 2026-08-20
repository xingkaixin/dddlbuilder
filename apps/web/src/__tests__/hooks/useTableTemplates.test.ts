import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTableTemplates } from '@/hooks/useTableTemplates';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '../utils/fakeIndexedDb';
import { flushPromises } from '@/__tests__/utils/test-utils';
import type { PersistedState } from '@ddlbuilder/shared-types';

const createState = (name: string): PersistedState => ({
  schemaName: '',
  tableName: name,
  tableComment: '测试',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [
    {
      order: 1,
      fieldName: 'id',
      fieldType: 'bigint',
      fieldComment: 'ID',
      nullable: false,
      defaultKind: 'auto_increment',
      defaultValue: '',
      onUpdate: 'none',
    },
  ],
  addCount: 1,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
});

describe('useTableTemplates', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
  });

  it('loads templates on mount', async () => {
    const { result } = renderHook(() => useTableTemplates());

    expect(result.current.loading).toBe(true);
    await act(async () => {
      await flushPromises();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.templates).toEqual([]);
  });

  it('creates a template', async () => {
    const { result } = renderHook(() => useTableTemplates());

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const res = await result.current.create('Test Template', {
        dbType: 'mysql',
        rows: createState('t1').rows,
        indexes: [],
      });
      expect(res.ok).toBe(true);
    });

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.templates).toHaveLength(1);
    expect(result.current.templates[0].name).toBe('Test Template');
    expect(result.current.error).toBeNull();
  });

  it('renames a template', async () => {
    const { result } = renderHook(() => useTableTemplates());

    await act(async () => {
      await flushPromises();
    });

    let templateId: string;
    await act(async () => {
      const res = await result.current.create('Old Name', {
        dbType: 'mysql',
        rows: createState('t1').rows,
        indexes: [],
      });
      templateId = res.template?.id ?? '';
    });

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const res = await result.current.rename(templateId, 'New Name');
      expect(res.ok).toBe(true);
    });

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.templates[0].name).toBe('New Name');
  });

  it('deletes a template', async () => {
    const { result } = renderHook(() => useTableTemplates());

    await act(async () => {
      await flushPromises();
    });

    let templateId: string;
    await act(async () => {
      const res = await result.current.create('To Delete', {
        dbType: 'mysql',
        rows: createState('t1').rows,
        indexes: [],
      });
      templateId = res.template?.id ?? '';
    });

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.templates).toHaveLength(1);

    await act(async () => {
      const res = await result.current.remove(templateId);
      expect(res.ok).toBe(true);
    });

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.templates).toHaveLength(0);
  });

  it('duplicates a template', async () => {
    const { result } = renderHook(() => useTableTemplates());

    await act(async () => {
      await flushPromises();
    });

    let templateId: string;
    await act(async () => {
      const res = await result.current.create('Original', {
        dbType: 'mysql',
        rows: createState('t1').rows,
        indexes: [],
      });
      templateId = res.template?.id ?? '';
    });

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const res = await result.current.duplicate(templateId);
      expect(res.ok).toBe(true);
    });

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.templates).toHaveLength(2);
    expect(result.current.templates[0].name).toBe('Original (副本)');
  });

  it('fetches a single template', async () => {
    const { result } = renderHook(() => useTableTemplates());

    await act(async () => {
      await flushPromises();
    });

    let templateId: string;
    await act(async () => {
      const res = await result.current.create('Single', {
        dbType: 'mysql',
        rows: createState('t1').rows,
        indexes: [],
      });
      templateId = res.template?.id ?? '';
    });

    await act(async () => {
      await flushPromises();
    });

    let fetched: Awaited<ReturnType<typeof result.current.fetchTemplate>>;
    await act(async () => {
      fetched = await result.current.fetchTemplate(templateId);
    });

    expect(fetched?.name).toBe('Single');
  });

  it('returns null for non-existent template', async () => {
    const { result } = renderHook(() => useTableTemplates());

    await act(async () => {
      await flushPromises();
    });

    let fetched: Awaited<ReturnType<typeof result.current.fetchTemplate>>;
    await act(async () => {
      fetched = await result.current.fetchTemplate('missing');
    });

    expect(fetched).toBeNull();
  });

  it('returns not_found when renaming non-existent template', async () => {
    const { result } = renderHook(() => useTableTemplates());

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const res = await result.current.rename('missing', 'New Name');
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('not_found');
    });
  });
});
