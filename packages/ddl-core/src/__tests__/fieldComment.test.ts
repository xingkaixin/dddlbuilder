import { describe, expect, it } from 'vitest';
import {
  DATABASE_TYPES,
  type DatabaseType,
  type NormalizedField,
  type PersistedState,
} from '@ddlbuilder/shared-types';
import { buildDDL } from '../utils/ddlGenerators';
import { diffPersistedState } from '../utils/tableDiff';
import { generateAlterDDL, generateRollbackDDL } from '../utils/alter-ddl';
import { resolveFieldComment } from '../utils/fieldComment';

const field: NormalizedField = {
  name: 'status',
  type: 'varchar(32)',
  comment: "Owner's status",
  nullable: false,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
  enumMeta: [{ value: 'active', i18n: { 'zh-CN': '启用', 'en-US': "It's active" } }],
};

const createState = (dbType: DatabaseType, value: NormalizedField): PersistedState => ({
  dbType,
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  sqlFormatMode: 'compact',
  rows: [
    {
      id: 'status-id',
      fieldName: value.name,
      fieldType: value.type,
      fieldComment: value.comment,
      nullable: value.nullable,
      defaultKind: value.defaultKind,
      defaultValue: value.defaultValue,
      onUpdate: value.onUpdate,
      enumMeta: value.enumMeta,
    },
  ],
  indexes: [],
  currentIndexFields: [],
  indexInput: '',
  authObjects: [],
  authInput: '',
  addCount: 1,
});

describe('field comment semantics', () => {
  it('keeps raw quotes and merges translated labels without duplicates', () => {
    expect(resolveFieldComment(field)).toBe("Owner's status | 枚举: active(启用/It's active)");
    expect(
      resolveFieldComment({
        comment: '',
        enumMeta: [{ value: 'a', i18n: { 'zh-CN': 'A', 'en-US': 'A' } }, { value: 'b' }],
      }),
    ).toBe('枚举: a(A), b');
    expect(resolveFieldComment({ comment: "Owner's status", enumMeta: [] })).toBe("Owner's status");
  });

  it.each(DATABASE_TYPES)(
    '%s CREATE renders derived comments with exactly one escape',
    (dbType) => {
      const sql = buildDDL({ dbType, tableName: 'app.users', tableComment: '', fields: [field] });
      expect(sql).toContain("Owner''s status | 枚举: active(启用/It''s active)");
      expect(sql).not.toContain("Owner''''s");
      expect(field.comment).toBe("Owner's status");
    },
  );

  it.each(['mysql', 'postgresql'] as const)(
    '%s CREATE, diff, ALTER and rollback agree on enum comments',
    (dbType) => {
      const nextField = {
        ...field,
        enumMeta: [{ value: 'active', i18n: { 'en-US': "It's enabled" } }],
      };
      const before = createState(dbType, field);
      const after = createState(dbType, nextField);
      const diff = diffPersistedState(before, after);
      expect(diff.fields[0].changes).toEqual(['comment']);
      const create = buildDDL({
        dbType,
        tableName: 'users',
        tableComment: '',
        fields: [nextField],
      });
      const alter = generateAlterDDL('users', diff, [], dbType);
      const rollback = generateRollbackDDL('users', diff, [], dbType);
      const expectedComment = "Owner''s status | 枚举: active(It''s enabled)";
      expect(create).toContain(expectedComment);
      expect(alter).toContain(expectedComment);
      expect(rollback).toContain("Owner''s status | 枚举: active(启用/It''s active)");
      expect(diff.fields[0].newField?.comment).toBe("Owner's status | 枚举: active(It's enabled)");
    },
  );

  it('detects adding and removing enum metadata but ignores display colors', () => {
    const before = createState('mysql', field);
    const withoutEnums = createState('mysql', { ...field, enumMeta: undefined });
    expect(diffPersistedState(before, withoutEnums).fields[0].changes).toEqual(['comment']);
    expect(diffPersistedState(withoutEnums, before).fields[0].changes).toEqual(['comment']);
    const recolored = createState('mysql', {
      ...field,
      enumMeta: field.enumMeta?.map((meta) => ({ ...meta, color: '#ffffff' })),
    });
    expect(diffPersistedState(before, recolored).hasChanges).toBe(false);
  });
});
