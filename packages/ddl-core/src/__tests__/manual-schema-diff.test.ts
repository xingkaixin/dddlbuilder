import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { diffPersistedState, hasTableChanges } from '../utils/tableDiff';
import { generateAlterDDL } from '../utils/alter-ddl/generateAlterDDL';
import { generateRollbackDDL } from '../utils/alter-ddl/generateRollbackDDL';

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
      name: 'database dialect',
      before: state(),
      after: state({ dbType: 'postgresql' }),
      reason: 'dbType',
    },
    {
      name: 'partition removal',
      before: state({ mysqlPartitionConfig: partition }),
      after: state(),
      reason: 'mysqlPartition',
    },
  ])('detects $name and prevents incomplete automatic migrations', ({ before, after, reason }) => {
    const diff = diffPersistedState(before, after);
    expect(hasTableChanges(diff)).toBe(true);
    expect(diff.manualChanges).toContain(reason);

    for (const sql of [generateAlterDDL(diff), generateRollbackDDL(diff)]) {
      expect(sql).toContain('Manual migration required');
      expect(sql).toContain('No automatic changes generated');
      expect(sql.split('\n').every((line) => line.startsWith('--'))).toBe(true);
    }
  });

  it('ignores unchanged views and unused table view settings', () => {
    expect(hasTableChanges(diffPersistedState(view, view))).toBe(false);
    expect(
      hasTableChanges(diffPersistedState(state(), state({ viewDefinition: 'SELECT 1' }))),
    ).toBe(false);
    expect(hasTableChanges(diffPersistedState(state(), state({ objectType: undefined })))).toBe(
      false,
    );
  });
});
