import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FieldRow } from '@ddlbuilder/shared-types';
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
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';

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
        nullable: false,
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
          nullable: true,
          defaultKind: 'none',
          defaultValue: 'x',
          onUpdate: 'current_timestamp',
        },
        {
          fieldName: '   ',
          fieldType: 'int',
          nullable: false,
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
      nullable: true,
      defaultKind: 'none',
      defaultValue: 'x',
      onUpdate: 'current_timestamp',
    });
  });

  it('should normalize nullable through the shared normalizer', async () => {
    // 迁移前存的是中文枚举值，套用旧模板时要能正确读回
    const legacyField = (fieldName: string, nullable: unknown) =>
      ({ fieldName, fieldType: 'varchar(20)', nullable }) as Partial<FieldRow>;

    const template = await createTemplateFromFields('Nullable Fallback', [
      legacyField('status', '否'),
      legacyField('remark', '是'),
      legacyField('note', 'unknown'),
    ]);

    expect(template.fields.map((field) => field.nullable)).toEqual([false, true, true]);
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
