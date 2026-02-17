import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  renameTemplate,
  deleteTemplate,
  duplicateTemplate,
  createTemplateFromFields,
} from '@/utils/fieldTemplates';
import {
  setupFakeIndexedDB,
  teardownFakeIndexedDB,
} from '@/__tests__/utils/fakeIndexedDb';

describe('fieldTemplates', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    teardownFakeIndexedDB();
  });

  it('should create and list templates with defaults', async () => {
    const templateA = await createTemplate('  ', [], '  desc  ');
    vi.setSystemTime(new Date('2026-01-01T00:00:10Z'));
    const templateB = await createTemplate('Temp B', [], undefined);

    expect(templateA.name).toBe('未命名模板');
    expect(templateA.description).toBe('desc');

    const list = await listTemplates();
    expect(list.map((item) => item.id)).toEqual([templateB.id, templateA.id]);
  });

  it('should get, update, duplicate and delete templates', async () => {
    const template = await createTemplate('Demo', [
      {
        fieldName: 'id',
        fieldType: 'int',
        nullable: '否',
      },
    ]);

    const fetched = await getTemplate(template.id);
    expect(fetched?.name).toBe('Demo');

    const updated = await updateTemplate(template.id, {
      name: '  Updated  ',
      description: '  detail  ',
    });
    expect(updated?.name).toBe('Updated');
    expect(updated?.description).toBe('detail');

    const duplicate = await duplicateTemplate(template.id);
    expect(duplicate?.name).toBe('Updated (副本)');
    expect(duplicate?.fields).toHaveLength(1);

    await deleteTemplate(template.id);
    const afterDelete = await listTemplates();
    expect(afterDelete.find((item) => item.id === template.id)).toBeUndefined();
  });

  it('should return null when updating missing template', async () => {
    const result = await updateTemplate('missing', { name: 'x' });
    expect(result).toBeNull();
  });

  it('should rename template through renameTemplate wrapper', async () => {
    const template = await createTemplate('Old Name', []);
    const renamed = await renameTemplate(template.id, '  New Name  ');

    expect(renamed?.name).toBe('New Name');
  });

  it('should create template from fields with filtering and normalize', async () => {
    const template = await createTemplateFromFields(
      'From Fields',
      [
        {
          fieldName: '  name  ',
          fieldType: ' varchar(20) ',
          fieldComment: '  comment ',
          nullable: '是',
          defaultKind: 'none',
          defaultValue: 'x',
          onUpdate: 'now',
        },
        {
          fieldName: '   ',
          fieldType: 'int',
          nullable: '否',
        },
      ],
      '  desc ',
    );

    expect(template.description).toBe('desc');
    expect(template.fields).toHaveLength(1);
    expect(template.fields[0]).toEqual({
      fieldName: 'name',
      fieldType: 'varchar(20)',
      fieldComment: 'comment',
      nullable: '是',
      defaultKind: 'none',
      defaultValue: 'x',
      onUpdate: 'now',
    });
  });

  it('should normalize nullable field to 否 when value is not 是', async () => {
    const template = await createTemplateFromFields('Nullable Fallback', [
      {
        fieldName: 'status',
        fieldType: 'varchar(20)',
        nullable: 'unknown',
      },
    ]);

    expect(template.fields[0].nullable).toBe('否');
  });

  it('should return null when duplicating missing template', async () => {
    const result = await duplicateTemplate('missing');
    expect(result).toBeNull();
  });

  it('should close db and reject when transaction throws', async () => {
    const close = vi.fn();
    const brokenDb = {
      transaction: () => {
        throw new Error('tx failed');
      },
      close,
    };
    const request: {
      result: unknown;
      error: unknown;
      onsuccess: null | (() => void);
      onerror: null | (() => void);
      onupgradeneeded: null | (() => void);
    } = {
      result: brokenDb,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };

    Object.defineProperty(globalThis, 'indexedDB', {
      value: {
        open: () => {
          queueMicrotask(() => request.onsuccess?.());
          return request;
        },
      },
      configurable: true,
      writable: true,
    });

    await expect(listTemplates()).rejects.toThrow('tx failed');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
