import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFieldTemplates } from '@/hooks/useFieldTemplates';
import { flushPromises } from '@/__tests__/utils/test-utils';
import * as fieldTemplates from '@/utils/fieldTemplates';

vi.mock('@/utils/fieldTemplates', () => ({
  __esModule: true,
  listTemplates: vi.fn(),
  getTemplate: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  renameTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  duplicateTemplate: vi.fn(),
  createTemplateFromFields: vi.fn(),
}));

describe('useFieldTemplates', () => {
  const mockListTemplates = vi.mocked(fieldTemplates.listTemplates);
  const mockGetTemplate = vi.mocked(fieldTemplates.getTemplate);
  const mockCreateTemplate = vi.mocked(fieldTemplates.createTemplate);
  const mockUpdateTemplate = vi.mocked(fieldTemplates.updateTemplate);
  const mockRenameTemplate = vi.mocked(fieldTemplates.renameTemplate);
  const mockDeleteTemplate = vi.mocked(fieldTemplates.deleteTemplate);
  const mockDuplicateTemplate = vi.mocked(fieldTemplates.duplicateTemplate);
  const mockCreateTemplateFromFields = vi.mocked(
    fieldTemplates.createTemplateFromFields,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load templates on mount', async () => {
    mockListTemplates.mockResolvedValue([
      {
        id: '1',
        name: 'Demo',
        fields: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.templates).toHaveLength(1);
    expect(result.current.error).toBe(null);
  });

  it('should handle refresh error', async () => {
    mockListTemplates.mockRejectedValue(new Error('load error'));

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('load error');
  });

  it('should fallback to default message when refresh fails with non-error', async () => {
    mockListTemplates.mockRejectedValue('boom');

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('加载模板失败');
  });

  it('should create template and refresh list', async () => {
    const created = {
      id: '2',
      name: 'New',
      fields: [],
      createdAt: 1,
      updatedAt: 2,
    };

    mockListTemplates
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([created]);
    mockCreateTemplate.mockResolvedValue(created);

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    let response:
      | { ok: boolean; template?: { id: string }; message?: string }
      | undefined;
    await act(async () => {
      response = await result.current.create('New', []);
      await flushPromises();
    });

    expect(response).toEqual({ ok: true, template: created });
    expect(result.current.templates).toHaveLength(1);
  });

  it('should return not_found when update missing', async () => {
    mockListTemplates.mockResolvedValue([]);
    mockUpdateTemplate.mockResolvedValue(null);

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    const response = await result.current.update('missing', { name: 'x' });
    expect(response).toEqual({
      ok: false,
      reason: 'not_found',
      message: '模板不存在',
    });
  });

  it('should return not_found when rename/duplicate missing', async () => {
    mockListTemplates.mockResolvedValue([]);
    mockRenameTemplate.mockResolvedValue(null);
    mockDuplicateTemplate.mockResolvedValue(null);

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    const renameResult = await result.current.rename('missing', 'x');
    expect(renameResult).toEqual({
      ok: false,
      reason: 'not_found',
      message: '模板不存在',
    });

    const duplicateResult = await result.current.duplicate('missing');
    expect(duplicateResult).toEqual({
      ok: false,
      reason: 'not_found',
      message: '模板不存在',
    });
  });

  it('should handle createFromFields errors', async () => {
    mockListTemplates.mockResolvedValue([]);
    mockCreateTemplateFromFields.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    const response = await result.current.createFromFields('Demo', []);
    expect(response).toEqual({ ok: false, message: 'boom' });
  });

  it('should return null when fetchTemplate fails', async () => {
    mockListTemplates.mockResolvedValue([]);
    mockGetTemplate.mockRejectedValue(new Error('fetch failed'));

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    const fetched = await result.current.fetchTemplate('x');
    expect(fetched).toBeNull();
  });

  it('should return null when fetchTemplate returns null', async () => {
    mockListTemplates.mockResolvedValue([]);
    mockGetTemplate.mockResolvedValue(null);

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    const fetched = await result.current.fetchTemplate('x');
    expect(fetched).toBeNull();
  });

  it('should return template when fetchTemplate succeeds', async () => {
    mockListTemplates.mockResolvedValue([]);
    mockGetTemplate.mockResolvedValue({
      id: 'tpl-1',
      name: 'Tpl',
      fields: [],
      createdAt: 1,
      updatedAt: 1,
    });

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    const fetched = await result.current.fetchTemplate('tpl-1');
    expect(fetched?.id).toBe('tpl-1');
  });

  it('should create template from fields and refresh', async () => {
    const created = {
      id: 'from-fields',
      name: 'From Fields',
      fields: [],
      createdAt: 1,
      updatedAt: 1,
    };

    mockListTemplates.mockResolvedValue([]);
    mockCreateTemplateFromFields.mockResolvedValue(created);

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    let response:
      | { ok: boolean; template?: { id: string }; message?: string }
      | undefined;
    await act(async () => {
      response = await result.current.createFromFields('From Fields', []);
      await flushPromises();
    });
    expect(response).toEqual({ ok: true, template: created });
  });

  it('should handle createFromFields non-error failure', async () => {
    mockListTemplates.mockResolvedValue([]);
    mockCreateTemplateFromFields.mockRejectedValue('fail');

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    const response = await result.current.createFromFields('Demo', []);
    expect(response).toEqual({ ok: false, message: '创建失败' });
  });

  it('should handle update rename duplicate success', async () => {
    mockListTemplates.mockResolvedValue([]);
    mockUpdateTemplate.mockResolvedValue({
      id: '1',
      name: 'updated',
      fields: [],
      createdAt: 1,
      updatedAt: 2,
    });
    mockRenameTemplate.mockResolvedValue({
      id: '1',
      name: 'renamed',
      fields: [],
      createdAt: 1,
      updatedAt: 3,
    });
    mockDuplicateTemplate.mockResolvedValue({
      id: '2',
      name: 'copy',
      fields: [],
      createdAt: 2,
      updatedAt: 2,
    });

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    let updateResult: { ok: boolean; message?: string; reason?: string };
    let renameResult: { ok: boolean; message?: string; reason?: string };
    let duplicateResult:
      | { ok: boolean; message?: string; reason?: string; template?: unknown }
      | undefined;

    await act(async () => {
      updateResult = await result.current.update('1', { name: 'updated' });
      await flushPromises();
    });
    await act(async () => {
      renameResult = await result.current.rename('1', 'renamed');
      await flushPromises();
    });
    await act(async () => {
      duplicateResult = await result.current.duplicate('1', 'copy');
      await flushPromises();
    });

    expect(updateResult).toBeDefined();
    expect(renameResult).toBeDefined();
    expect(updateResult).toEqual({ ok: true });
    expect(renameResult).toEqual({ ok: true });
    expect(duplicateResult).toEqual({
      ok: true,
      template: {
        id: '2',
        name: 'copy',
        fields: [],
        createdAt: 2,
        updatedAt: 2,
      },
    });
  });

  it('should remove template and refresh', async () => {
    mockListTemplates
      .mockResolvedValueOnce([{ id: '1' } as any])
      .mockResolvedValueOnce([]);
    mockDeleteTemplate.mockResolvedValue(undefined);

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    let response:
      | { ok: boolean; message?: string; reason?: string }
      | undefined;
    await act(async () => {
      response = await result.current.remove('1');
      await flushPromises();
    });
    expect(response).toEqual({ ok: true });
  });

  it('should handle remove and duplicate non-error failures', async () => {
    mockListTemplates.mockResolvedValue([]);
    mockDeleteTemplate.mockRejectedValue('fail');
    mockDuplicateTemplate.mockRejectedValue('fail');

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    let removeResult: { ok: boolean; message?: string; reason?: string };
    let duplicateResult:
      | { ok: boolean; message?: string; reason?: string; template?: unknown }
      | undefined;

    await act(async () => {
      removeResult = await result.current.remove('1');
      await flushPromises();
    });
    await act(async () => {
      duplicateResult = await result.current.duplicate('1');
      await flushPromises();
    });

    expect(removeResult).toBeDefined();
    expect(removeResult).toEqual({
      ok: false,
      message: '删除失败',
    });
    expect(duplicateResult).toEqual({
      ok: false,
      message: '复制失败',
    });
  });

  it('should handle create update rename non-error failures', async () => {
    mockListTemplates.mockResolvedValue([]);
    mockCreateTemplate.mockRejectedValue('fail');
    mockUpdateTemplate.mockRejectedValue('fail');
    mockRenameTemplate.mockRejectedValue('fail');

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    expect(await result.current.create('x', [])).toEqual({
      ok: false,
      message: '创建失败',
    });
    expect(await result.current.update('1', { name: 'x' })).toEqual({
      ok: false,
      message: '更新失败',
    });
    expect(await result.current.rename('1', 'x')).toEqual({
      ok: false,
      message: '重命名失败',
    });
  });

  it('should use error messages from thrown Error objects', async () => {
    mockListTemplates.mockResolvedValue([]);
    mockCreateTemplate.mockRejectedValue(new Error('create-err'));
    mockUpdateTemplate.mockRejectedValue(new Error('update-err'));
    mockRenameTemplate.mockRejectedValue(new Error('rename-err'));
    mockDeleteTemplate.mockRejectedValue(new Error('delete-err'));
    mockDuplicateTemplate.mockRejectedValue(new Error('duplicate-err'));

    const { result } = renderHook(() => useFieldTemplates());

    await act(async () => {
      await flushPromises();
    });

    expect(await result.current.create('x', [])).toEqual({
      ok: false,
      message: 'create-err',
    });
    expect(await result.current.update('1', { name: 'x' })).toEqual({
      ok: false,
      message: 'update-err',
    });
    expect(await result.current.rename('1', 'x')).toEqual({
      ok: false,
      message: 'rename-err',
    });
    expect(await result.current.remove('1')).toEqual({
      ok: false,
      message: 'delete-err',
    });
    expect(await result.current.duplicate('1')).toEqual({
      ok: false,
      message: 'duplicate-err',
    });
  });
});
