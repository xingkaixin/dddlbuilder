import { describe, expect, it } from 'vitest';
import type { NormalizedField } from '@ddlbuilder/shared-types';
import { SqlParser } from '../parser/SqlParser';
import { buildORM } from '../utils/ormGenerators';

describe('SQLAlchemy defaults', () => {
  it('preserves imported boolean and temporal constants as database defaults', async () => {
    const parsed = await new SqlParser().parseAsync(
      `CREATE TABLE flags (
        id INT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        created_at DATETIME NOT NULL DEFAULT '2026-01-01 00:00:00'
      )`,
      'mysql',
    );
    const model = buildORM('sqlalchemy', { dbType: 'mysql', ...parsed });

    expect(model).toContain(
      "enabled = Column(Boolean, nullable=False, server_default=literal_column('false'))",
    );
    expect(model).toContain(
      "created_at = Column(DateTime, nullable=False, server_default=literal_column('\\'2026-01-01 00:00:00\\''))",
    );
  });

  it.each(['postgresql', 'mysql'] as const)(
    'preserves imported non-generated integer primary keys for %s',
    async (dbType) => {
      const parsed = await new SqlParser().parseAsync(
        'CREATE TABLE events (id INT PRIMARY KEY, label VARCHAR(30))',
        dbType,
      );
      const model = buildORM('sqlalchemy', { dbType, ...parsed });
      expect(model).toContain('id = Column(Integer, primary_key=True, autoincrement=False)');
    },
  );

  it.each([
    ['int', 'auto_increment', 'Integer', 'True'],
    ['bigint', 'none', 'BigInteger', 'False'],
    ['smallint', 'none', 'SmallInteger', 'False'],
    ['serial', 'none', 'Integer', 'True'],
    ['bigserial', 'none', 'BigInteger', 'True'],
  ] as const)('preserves generation intent for %s with %s', (type, defaultKind, ormType, auto) => {
    const model = buildORM('sqlalchemy', {
      dbType: 'postgresql',
      tableName: 'events',
      tableComment: '',
      fields: [
        {
          name: 'id',
          type,
          nullable: false,
          comment: '',
          defaultKind,
          defaultValue: '',
          onUpdate: 'none',
        },
      ],
      indexes: [
        {
          id: 'pk',
          name: 'pk_events',
          kind: 'primary',
          fields: [{ name: 'id', direction: 'ASC' }],
        },
      ],
    });
    expect(model).toContain(`id = Column(${ormType}, primary_key=True, autoincrement=${auto})`);
  });

  it('keeps numeric precision and string literals in their SQL forms', () => {
    const field: NormalizedField = {
      name: 'amount',
      type: 'decimal(30, 2)',
      comment: '',
      nullable: true,
      defaultKind: 'constant',
      defaultValue: '12345678901234567890.12',
      onUpdate: 'none',
    };
    const model = buildORM('sqlalchemy', {
      dbType: 'postgresql',
      tableName: 'defaults',
      tableComment: '',
      fields: [
        field,
        { ...field, name: 'label', type: 'text', defaultValue: "O'Brien" },
        { ...field, name: 'empty_label', type: 'text', defaultValue: '' },
        { ...field, name: 'literal', type: 'text', defaultValue: 'now()' },
        { ...field, name: 'numeric_label', type: 'text', defaultValue: '0012' },
        { ...field, name: 'colon_label', type: 'text', defaultValue: ':token' },
      ],
    });

    expect(model).toContain("server_default=literal_column('12345678901234567890.12')");
    expect(model).toContain("server_default=literal_column('\\'O\\'\\'Brien\\'')");
    expect(model).toContain("server_default=literal_column('\\'\\'')");
    expect(model).toContain("server_default=literal_column('\\'now()\\'')");
    expect(model).toContain("server_default=literal_column('\\'0012\\'')");
    expect(model).toContain("server_default=literal_column('\\':token\\'')");
  });
});
