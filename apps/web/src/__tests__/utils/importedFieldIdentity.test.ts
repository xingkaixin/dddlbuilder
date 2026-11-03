import { describe, expect, it } from 'vitest';
import { SqlParser } from '@ddlbuilder/ddl-core/parser';
import { diffPersistedState, generateAlterDDL, hasTableChanges } from '@ddlbuilder/ddl-core';
import { convertParsedResultToPersistedState } from '@/utils/convertParsedResultToPersistedState';
import { preserveImportedFieldIds } from '@/utils/importedFieldIdentity';

const parseState = async (sql: string) =>
  convertParsedResultToPersistedState(await new SqlParser().parseAsync(sql, 'mysql'), 'mysql');

describe('preserveImportedFieldIds', () => {
  it('重复导入相同 SQL 不生成字段迁移', async () => {
    const sql = 'CREATE TABLE users (id INT, email VARCHAR(100));';
    const existing = await parseState(sql);
    const imported = await parseState(sql);
    const result = preserveImportedFieldIds(existing, imported);
    const diff = diffPersistedState(existing, result);

    expect(imported.rows[0].id).not.toBe(existing.rows[0].id);
    expect(result.rows.slice(0, 2).map((row) => row.id)).toEqual(
      existing.rows.slice(0, 2).map((row) => row.id),
    );
    expect(hasTableChanges(diff)).toBe(false);
    expect(generateAlterDDL(diff)).toBe('');
  });

  it('字段重排或类型变更保留身份，新增字段使用新身份', async () => {
    const existing = await parseState('CREATE TABLE users (id INT, email VARCHAR(100));');

    const imported = await parseState(
      'CREATE TABLE users (email VARCHAR(200), id INT, active INT);',
    );
    const result = preserveImportedFieldIds(existing, imported);
    expect(result.rows.slice(0, 3).map((row) => row.id)).toEqual([
      existing.rows[1].id,
      existing.rows[0].id,
      imported.rows[2].id,
    ]);
    expect(
      diffPersistedState(existing, result).fields.map(({ type, fieldName }) => ({
        type,
        fieldName,
      })),
    ).toEqual([
      { type: 'modify', fieldName: 'email' },
      { type: 'add', fieldName: 'active' },
    ]);
  });
});
