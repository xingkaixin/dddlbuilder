import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFieldTemplates } from '@/hooks/useFieldTemplates';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '../utils/fakeIndexedDb';
import { flushPromises } from '@/__tests__/utils/test-utils';

describe('useFieldTemplates', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
  });

  it('loads templates on mount', async () => {
    const { result } = renderHook(() => useFieldTemplates());

    expect(result.current.loading).toBe(true);
    await act(async () => {
      await flushPromises();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.templates).toEqual([]);
  });

  it('creates a template', async () => {
    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const res = await result.current.create('User Fields', [
        { fieldName: 'id', fieldType: 'bigint', nullable: false, defaultKind: 'auto_increment' },
      ]);
      expect(res.ok).toBe(true);
    });

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.templates).toHaveLength(1);
    expect(result.current.templates[0].name).toBe('User Fields');
    expect(result.current.error).toBeNull();
  });

  it('creates template from fields', async () => {
    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const res = await result.current.createFromFields('From Fields', [
        { fieldName: 'name', fieldType: 'varchar(50)', nullable: true },
      ]);
      expect(res.ok).toBe(true);
    });

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.templates).toHaveLength(1);
    expect(result.current.templates[0].name).toBe('From Fields');
    expect(result.current.templates[0].fields).toHaveLength(1);
    expect(result.current.templates[0].fields[0].fieldName).toBe('name');
  });

  it('filters empty fields when creating from fields', async () => {
    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const res = await result.current.createFromFields('Mixed', [
        { fieldName: '', fieldType: 'int' },
        { fieldName: 'valid', fieldType: 'varchar(20)' },
      ]);
      expect(res.ok).toBe(true);
    });

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.templates[0].fields).toHaveLength(1);
    expect(result.current.templates[0].fields[0].fieldName).toBe('valid');
  });

  it('renames a template', async () => {
    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    let templateId: string;
    await act(async () => {
      const res = await result.current.create('Old Name', []);
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
    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    let templateId: string;
    await act(async () => {
      const res = await result.current.create('To Delete', []);
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
    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    let templateId: string;
    await act(async () => {
      const res = await result.current.create('Original', [
        { fieldName: 'id', fieldType: 'bigint', nullable: false },
      ]);
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
    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    let templateId: string;
    await act(async () => {
      const res = await result.current.create('Single', [
        { fieldName: 'email', fieldType: 'varchar(100)', nullable: true },
      ]);
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
    expect(fetched?.fields).toHaveLength(1);
  });

  it('returns null for non-existent template', async () => {
    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    let fetched: Awaited<ReturnType<typeof result.current.fetchTemplate>>;
    await act(async () => {
      fetched = await result.current.fetchTemplate('missing');
    });

    expect(fetched).toBeNull();
  });

  it('updates a template', async () => {
    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    let templateId: string;
    await act(async () => {
      const res = await result.current.create('Original', []);
      templateId = res.template?.id ?? '';
    });

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const res = await result.current.update(templateId, {
        name: 'Updated',
        description: 'New desc',
      });
      expect(res.ok).toBe(true);
    });

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.templates[0].name).toBe('Updated');
    expect(result.current.templates[0].description).toBe('New desc');
  });

  it('returns not_found when updating non-existent template', async () => {
    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const res = await result.current.update('missing', { name: 'New' });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('not_found');
    });
  });

  it('returns not_found when renaming non-existent template', async () => {
    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const res = await result.current.rename('missing', 'New Name');
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('not_found');
    });
  });

  it('returns not_found when duplicating non-existent template', async () => {
    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const res = await result.current.duplicate('missing');
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('not_found');
    });
  });

  it('handles empty name by using default', async () => {
    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    await act(async () => {
      const res = await result.current.create('', []);
      expect(res.ok).toBe(true);
    });

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.templates[0].name).toBe('未命名模板');
  });
});
