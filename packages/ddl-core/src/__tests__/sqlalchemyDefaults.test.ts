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
