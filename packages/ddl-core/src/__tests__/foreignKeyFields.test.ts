import { describe, expect, it } from 'vitest';
import type { ForeignKeyDefinition, NormalizedField } from '@ddlbuilder/shared-types';
import {
  buildDDL,
  buildORM,
  diffPersistedState,
  generateAlterDDL,
  getForeignKeyIssue,
} from '../index';
import { withDefaultEditorSession } from '@ddlbuilder/shared-types';

const fields: NormalizedField[] = ['tenant_id', 'user_id'].map((name) => ({
  name,
  type: 'int',
  comment: '',
  nullable: false,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
}));
const foreignKey: ForeignKeyDefinition = {
  id: 'fk',
  name: 'fk_owner',
  fields: ['tenant_id', 'user_id'],
  refTable: 'users',
  refFields: ['tenant_id', 'id'],
};

describe('foreign key field correspondence', () => {
  it.each([
    { fields: [] },
    { refFields: [] },
    { refFields: ['id'] },
    { refFields: ['tenant_id', 'id', 'other_id'] },
    { fields: ['tenant_id', ''] },
    { refFields: ['tenant_id', '""'] },
    { fields: ['user_id', 'user_id'] },
    { refFields: ['id', 'id'] },
    { refTable: ' ' },
  ] satisfies Partial<ForeignKeyDefinition>[])(
    'rejects incomplete definitions without dropping any fields: %j',
    (overrides) => {
      const fk = { ...foreignKey, ...overrides };
      expect(getForeignKeyIssue(fk, 'postgresql')?.kind).toBe('fields');
      const sql = buildDDL({
        dbType: 'postgresql',
        tableName: 'orders',
        tableComment: '',
        fields,
        foreignKeys: [fk],
      });
      expect(sql).toContain('Manual migration required');
      expect(sql).toContain('CREATE TABLE');
      expect(sql).not.toContain('ADD CONSTRAINT');
    },
  );

  it.each(['prisma', 'typeorm', 'sqlalchemy', 'gorm', 'jpa'] as const)(
    'does not generate a misleading %s model for an incomplete foreign key',
    (target) => {
      const model = buildORM(target, {
        dbType: 'mysql',
        tableName: 'orders',
        tableComment: '',
        fields,
        foreignKeys: [{ ...foreignKey, refFields: ['id'] }],
      });
      expect(model).toContain('Manual mapping required');
      expect(model).not.toContain('undefined');
      expect(model.split('\n')).toHaveLength(1);
    },
  );

  it('uses dialect identifier identity when checking duplicates', () => {
    const fk = { ...foreignKey, refFields: ['UserID', 'userid'] };
    expect(getForeignKeyIssue(fk, 'mysql')?.kind).toBe('fields');
    expect(getForeignKeyIssue(fk, 'postgresql')).toBeNull();
    expect(
      getForeignKeyIssue({ ...fk, refFields: ['UserID', '"UserID"'] }, 'postgresql')?.kind,
    ).toBe('fields');
  });

  it('keeps the requested field order for a complete composite foreign key', () => {
    const sql = buildDDL({
      dbType: 'postgresql',
      tableName: 'orders',
      tableComment: '',
      fields,
      foreignKeys: [foreignKey],
    });
    expect(sql).toContain('FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id);');
  });

  it('does not drop an existing constraint if its replacement is incomplete', () => {
    const base = withDefaultEditorSession({
      dbType: 'postgresql',
      schemaName: '',
      tableName: 'orders',
      tableComment: '',
      rows: [],
      indexes: [],
      authInput: '',
      authObjects: [],
      foreignKeys: [foreignKey],
    });
    const next = { ...base, foreignKeys: [{ ...foreignKey, refFields: ['id'] }] };
    const sql = generateAlterDDL(diffPersistedState(base, next));
    expect(sql).toContain('Manual migration required');
    expect(sql).not.toContain('DROP CONSTRAINT');
    expect(sql).not.toContain('ADD CONSTRAINT');
  });
});
