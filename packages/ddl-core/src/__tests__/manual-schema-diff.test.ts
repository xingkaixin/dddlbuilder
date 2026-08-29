import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { diffPersistedState } from '../utils/tableDiff';
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
  authInput: '',
  authObjects: [],
  ...overrides,
});
const view = state({
  objectType: 'view',
  dbType: 'postgresql',
  viewDefinition: 'SELECT id FROM users WHERE active = true',
});
const partition = { enabled: true, type: 'HASH' as const, columns: ['id'], partitionCount: 4 };

describe('schema changes requiring manual migration', () => {
  it.each([
    {
      name: 'view SQL',
      before: view,
      after: { ...view, viewDefinition: 'SELECT id FROM users WHERE active = false' },
      reason: 'view',
    },
    {
      name: 'view identity',
      before: view,
      after: { ...view, schemaName: 'archive', tableName: 'renamed' },
      reason: 'view',
    },
    {
      name: 'view creation mode',
      before: view,
      after: { ...view, viewCreateOrReplace: false },
      reason: 'view',
    },
    { name: 'object type', before: state(), after: view, reason: 'objectType' },
    {
      name: 'database dialect',
      before: state(),
      after: state({ dbType: 'postgresql' }),
      reason: 'dbType',
    },
    {
      name: 'partition count alongside table rename',
      before: state({ mysqlPartitionConfig: partition }),
      after: state({
        tableName: 'renamed',
        mysqlPartitionConfig: { ...partition, partitionCount: 8 },
      }),
      reason: 'mysqlPartition',
    },
    {
      name: 'partition removal',
      before: state({ mysqlPartitionConfig: partition }),
      after: state(),
      reason: 'mysqlPartition',
    },
    {
      name: 'Citus distribution',
      before: state({
        dbType: 'postgresql-citus',
        citusShardingConfig: { mode: 'distributed', distributionColumn: 'tenant_id' },
      }),
      after: state({ dbType: 'postgresql-citus', citusShardingConfig: { mode: 'reference' } }),
      reason: 'citusSharding',
    },
  ])('detects $name and prevents incomplete automatic migrations', ({ before, after, reason }) => {
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
  });

  it('ignores unchanged views and unused table view settings', () => {
    expect(diffPersistedState(view, view).hasChanges).toBe(false);
    expect(diffPersistedState(state(), state({ viewDefinition: 'SELECT 1' })).hasChanges).toBe(
      false,
    );
    expect(diffPersistedState(state(), state({ objectType: undefined })).hasChanges).toBe(false);
  });

  it('ignores disabled partition settings and unrelated dialects', () => {
    const before = state({ mysqlPartitionConfig: { ...partition, enabled: false } });
    const after = state({
      mysqlPartitionConfig: { ...partition, enabled: false, partitionCount: 8 },
    });
    expect(diffPersistedState(before, after).hasChanges).toBe(false);
    expect(
      diffPersistedState({ ...before, dbType: 'postgresql' }, { ...after, dbType: 'postgresql' })
        .hasChanges,
    ).toBe(false);
  });
});
