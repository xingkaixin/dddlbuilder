import { describe, expect, it } from 'vitest';
import { buildDDL, diffPersistedState, generateAlterDDL } from '../index';
import { DDLStrategyFactory } from '../factories/DDLStrategyFactory';
import { generateAddForeignKey } from '../utils/alter-ddl/foreignKeyStatements';
import type { DatabaseType, ForeignKeyDefinition, PersistedState } from '@ddlbuilder/shared-types';

const foreignKey: ForeignKeyDefinition = {
  id: 'fk',
  name: 'fk_user',
  fields: ['user_id'],
  refTable: 'users',
  refFields: ['id'],
};

describe('foreign key referential actions', () => {
  it.each([
    ['oracle', { onUpdate: 'CASCADE' }],
    ['oceanbase-oracle', { onDelete: 'RESTRICT' }],
    ['oracle', { onDelete: 'SET DEFAULT' }],
    ['sqlserver', { onUpdate: 'RESTRICT' }],
    ['mysql', { onDelete: 'SET DEFAULT' }],
    ['dm', { onDelete: 'RESTRICT' }],
  ] satisfies Array<[DatabaseType, Partial<ForeignKeyDefinition>]>)(
    '%s rejects unsupported actions %j in both generators',
    (dbType, actions) => {
      const fk = { ...foreignKey, ...actions };
      const create = DDLStrategyFactory.create(dbType).generateForeignKeyDDL('orders', fk);
      const alter = generateAddForeignKey('orders', { type: 'add', foreignKey: fk }, dbType);
      expect(create).toContain('Manual migration required');
      expect(alter).toBe(create);
    },
  );

  it('does not drop an existing constraint when its replacement is unsupported', () => {
    const base: PersistedState = {
      dbType: 'oracle',
      tableName: 'orders',
      tableComment: '',
      sqlFormatMode: 'compact',
      rows: [],
      indexes: [],
      foreignKeys: [foreignKey],
      addCount: 1,
      authInput: '',
      authObjects: [],
    };
    const next = { ...base, foreignKeys: [{ ...foreignKey, onUpdate: 'CASCADE' as const }] };
    const sql = generateAlterDDL('orders', diffPersistedState(base, next), [], 'oracle');
    expect(sql).toContain('Manual migration required');
    expect(sql).not.toContain('DROP CONSTRAINT');
  });

  it('emits the table and a notice for its unsupported constraint', () => {
    const sql = buildDDL({
      dbType: 'oracle',
      tableName: 'orders',
      tableComment: '',
      fields: [
        {
          name: 'user_id',
          type: 'int',
          comment: '',
          nullable: true,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
      ],
      foreignKeys: [{ ...foreignKey, onUpdate: 'CASCADE' }],
    });
    expect(sql).toContain('Manual migration required');
    expect(sql).toContain('CREATE TABLE');
  });

  it.each(['CASCADE', 'SET NULL'] as const)('preserves Oracle ON DELETE %s', (onDelete) => {
    const fk = { ...foreignKey, onDelete };
    const sql = DDLStrategyFactory.create('oracle').generateForeignKeyDDL('orders', fk);
    expect(sql).toBe(
      `ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE ${onDelete};`,
    );
    expect(generateAddForeignKey('orders', { type: 'add', foreignKey: fk }, 'oracle')).toBe(sql);
  });

  it.each([
    ['postgresql', 'RESTRICT'],
    ['postgresql', 'SET DEFAULT'],
    ['sqlserver', 'SET DEFAULT'],
    ['dm', 'SET DEFAULT'],
    ['mysql', 'RESTRICT'],
  ] as const)('preserves supported %s %s actions', (dbType, action) => {
    const fk = { ...foreignKey, onDelete: action, onUpdate: action };
    const sql = DDLStrategyFactory.create(dbType).generateForeignKeyDDL('orders', fk);
    expect(sql).toContain(`ON DELETE ${action} ON UPDATE ${action};`);
    expect(generateAddForeignKey('orders', { type: 'add', foreignKey: fk }, dbType)).toBe(sql);
  });
});
