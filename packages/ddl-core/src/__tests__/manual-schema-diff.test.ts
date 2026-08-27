import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { diffPersistedState, type ManualSchemaChange } from '../utils/tableDiff';
import { generateAlterDDL, generateRollbackDDL } from '../utils/alter-ddl';

const state = (overrides: Partial<PersistedState> = {}): PersistedState => ({
  objectType: 'table',
  schemaName: 'app',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  indexes: [],
  addCount: 1,
  indexInput: '',
  currentIndexFields: [],
  authInput: '',
  authObjects: [],
  ...overrides,
});

const expectManualMigration = (
  before: PersistedState,
  after: PersistedState,
  reason: ManualSchemaChange,
) => {
  const diff = diffPersistedState(before, after);
  expect(diff.hasChanges).toBe(true);
  expect(diff.manualChanges).toContain(reason);
  for (const sql of [
    generateAlterDDL('app.users', diff, [], after.dbType),
    generateRollbackDDL('app.users', diff, [], before.dbType),
  ]) {
    expect(sql).toContain('Manual migration required');
    expect(sql).toContain('No automatic changes generated');
    expect(sql.split('\n').every((line) => line.startsWith('--'))).toBe(true);
  }
};

describe('schema changes requiring manual migration', () => {
  it('detects view SQL changes and preserves a no-op comparison', () => {
    const before = state({
      objectType: 'view',
      dbType: 'postgresql',
      viewDefinition: 'SELECT id FROM users WHERE active = true',
    });
    expect(diffPersistedState(before, before).hasChanges).toBe(false);
    expectManualMigration(
      before,
      { ...before, viewDefinition: 'SELECT id FROM users WHERE active = false' },
      'view',
    );
  });

  it('does not emit table operations for changed views', () => {
    const before = state({ objectType: 'view', viewDefinition: 'SELECT 1' });
    expectManualMigration(
      before,
      { ...before, schemaName: 'archive', tableName: 'renamed' },
      'view',
    );
    expectManualMigration(before, { ...before, viewCreateOrReplace: false }, 'view');
  });

  it('does not treat retained view settings as table changes', () => {
    const before = state();
    expect(diffPersistedState(before, { ...before, viewDefinition: 'SELECT 1' }).hasChanges).toBe(
      false,
    );
    expect(diffPersistedState(before, { ...before, objectType: undefined }).hasChanges).toBe(false);
  });

  it('detects object kind and database changes', () => {
    const before = state();
    expectManualMigration(
      before,
      { ...before, objectType: 'view', viewDefinition: 'SELECT 1' },
      'objectType',
    );
    expectManualMigration(before, { ...before, dbType: 'postgresql' }, 'dbType');
  });

  it('detects partition changes alongside otherwise automatic changes', () => {
    const before = state({
      mysqlPartitionConfig: { enabled: true, type: 'HASH', columns: ['id'], partitionCount: 4 },
    });
    const after = {
      ...before,
      tableName: 'renamed',
      mysqlPartitionConfig: { ...before.mysqlPartitionConfig!, partitionCount: 8 },
    };
    expectManualMigration(before, after, 'mysqlPartition');
    expectManualMigration(before, { ...before, mysqlPartitionConfig: undefined }, 'mysqlPartition');
  });

  it('compares effective partition settings, ignoring disabled settings and unrelated dialects', () => {
    const before = state({
      mysqlPartitionConfig: { enabled: false, type: 'HASH', columns: ['id'], partitionCount: 4 },
    });
    const after = {
      ...before,
      mysqlPartitionConfig: { ...before.mysqlPartitionConfig!, partitionCount: 8 },
    };
    expect(diffPersistedState(before, after).hasChanges).toBe(false);
    expect(
      diffPersistedState({ ...before, dbType: 'postgresql' }, { ...after, dbType: 'postgresql' })
        .hasChanges,
    ).toBe(false);
  });

  it('detects Citus distribution changes', () => {
    const before = state({
      dbType: 'postgresql-citus',
      citusShardingConfig: { mode: 'distributed', distributionColumn: 'tenant_id' },
    });
    expectManualMigration(
      before,
      { ...before, citusShardingConfig: { mode: 'reference' } },
      'citusSharding',
    );
  });
});
