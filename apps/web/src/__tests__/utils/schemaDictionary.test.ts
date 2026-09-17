import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import i18n from '@/i18n';
import {
  buildDictionary,
  dictionaryHtml,
  dictionaryMarkdown,
} from '@/components/schema-tools/dictionary';

const users: PersistedState = {
  schemaName: 'sales',
  tableName: 'users',
  tableComment: '用户',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  addCount: 1,
  authInput: '',
  authObjects: [],
  indexes: [],
  rows: [
    {
      id: 'status',
      fieldName: 'status',
      fieldType: 'varchar(20)',
      fieldComment: '状态 | <img src=x onerror=alert(1)>',
      nullable: false,
      standardId: 'missing',
      enumMeta: [{ value: 'PAID', i18n: { 'zh-CN': '已支付' } }],
    },
  ],
};

describe('schema dictionary', () => {
  it('exports business metadata and keeps user content inert', () => {
    const document = buildDictionary(
      [users],
      [],
      '</title><script>alert(1)</script>',
      'zh-CN',
      i18n.t.bind(i18n),
    );
    const html = new DOMParser().parseFromString(dictionaryHtml(document), 'text/html');
    expect(html.querySelectorAll('script')).toHaveLength(1);
    expect(html.querySelector('img')).toBeNull();
    expect(html.body.textContent).toContain('已支付');
    expect(html.body.textContent).toContain('标准缺失: missing');
    expect(html.querySelector('title')?.textContent).toBe('</title><script>alert(1)</script>');
    const markdown = dictionaryMarkdown(document);
    expect(markdown).toContain('状态 \\| &lt;img');
    expect(markdown).not.toContain('<script>');
  });

  it('resolves schema-qualified relationships and marks references outside the document', () => {
    const orders = {
      ...users,
      tableName: 'orders',
      foreignKeys: [
        { id: 'fk', name: 'fk_user', fields: ['user_id'], refTable: 'users', refFields: ['id'] },
        {
          id: 'external',
          name: 'fk_other',
          fields: ['other_id'],
          refSchema: 'archive',
          refTable: 'users',
          refFields: ['id'],
        },
      ],
    };
    const document = buildDictionary([users, orders], [], 'Dictionary', 'en-US', i18n.t.bind(i18n));
    expect(document.tables[1].relationships[0].targetId).toBe('table-0');
    expect(document.tables[1].relationships[1].targetId).toBeUndefined();
    expect(document.tables[1].relationships[1].values[2]).toContain('archive.users');
  });
});
