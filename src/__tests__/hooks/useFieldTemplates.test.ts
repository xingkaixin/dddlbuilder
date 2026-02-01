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
});
