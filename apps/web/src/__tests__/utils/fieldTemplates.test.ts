import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FieldRow } from '@ddlbuilder/shared-types';
import { getTemplate, createTemplateFromFields } from '@/utils/fieldTemplates';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';

describe('fieldTemplates', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
  });

  it('preserves logical enum metadata when saving fields as a template', async () => {
    const field: FieldRow = {
      id: 'source-status',
      fieldName: 'status',
      fieldType: 'INT',
      fieldComment: '状态',
      nullable: false,
      enumMeta: [{ value: '1', color: '#16a34a', i18n: { 'zh-CN': '启用', 'en-US': 'Active' } }],
    };

    const saved = await createTemplateFromFields('状态模板', [field]);
    const loaded = await getTemplate(saved.id);
    console.info('Saved template enum metadata', loaded?.fields[0]);

    expect(loaded?.fields[0]).toMatchObject({ enumMeta: field.enumMeta });
    expect(loaded?.fields[0]).not.toHaveProperty('id');
  });
});
