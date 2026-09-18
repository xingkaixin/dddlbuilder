import { describe, expect, it } from 'vitest';
import { instantiateBusinessModule } from '../utils/businessModules';
import { analyzeFieldImpact, impactFieldNames } from '../utils/fieldImpact';
import { snapshotTableKey } from '../utils/schemaSnapshot';

describe('field impact analysis', () => {
  it('reports inbound and outbound composite relationships as complete groups', () => {
    const tables = instantiateBusinessModule('rbac', 'mysql', '', 'integer');
    const [users, , , memberships] = tables;
    const incoming = analyzeFieldImpact(tables, snapshotTableKey(users), 'ID');
    expect(incoming.dependencies.map((item) => item.kind)).toEqual(['index', 'foreignKey']);
    expect(incoming.dependencies[1]).toMatchObject({
      table: 'user_roles',
      fields: ['user_id'],
      relatedTable: 'users',
      relatedFields: ['id'],
      direction: 'incoming',
    });
    const outgoing = analyzeFieldImpact(tables, snapshotTableKey(memberships), 'user_id');
    expect(outgoing.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fields: ['user_id', 'role_id'], kind: 'index' }),
        expect.objectContaining({ kind: 'foreignKey', direction: 'outgoing' }),
      ]),
    );
    memberships.foreignKeys = [
      {
        id: 'composite',
        name: 'logical_membership',
        fields: ['user_id', 'role_id'],
        refTable: 'users',
        refFields: ['id', 'username'],
        logical: { cardinality: 'many-to-one', optionality: 'required' },
      },
    ];
    const logical = analyzeFieldImpact(tables, snapshotTableKey(users), 'id');
    expect(logical.dependencies[1]).toMatchObject({
      kind: 'logicalRelation',
      fields: ['user_id', 'role_id'],
      relatedFields: ['id', 'username'],
    });
  });
  it('resolves schema and dialect identity without guessing missing references', () => {
    const tables = instantiateBusinessModule('rbac', 'postgresql', '', 'integer');
    tables.forEach((table) => {
      table.schemaName = 'app';
    });
    const other = { ...tables[0], schemaName: 'other' };
    const report = analyzeFieldImpact([...tables, other], snapshotTableKey(other), 'id');
    expect(report.dependencies).toHaveLength(1);
    const parent = { ...tables[0], objectType: 'view' as const };
    const partial = analyzeFieldImpact([tables[3], parent], snapshotTableKey(tables[3]), 'user_id');
    expect(partial).toMatchObject({ tablesChecked: 1, viewsExcluded: ['app.users'] });
    expect(partial.externalRelations).toHaveLength(2);
    expect(() =>
      analyzeFieldImpact([tables[0], tables[0]], snapshotTableKey(tables[0]), 'id'),
    ).toThrow('duplicate table');
    expect(() =>
      analyzeFieldImpact(
        [tables[0], { ...tables[1], dbType: 'mysql' }],
        snapshotTableKey(tables[0]),
        'id',
      ),
    ).toThrow('one database');
    expect(() =>
      analyzeFieldImpact(
        [{ ...tables[0], rows: [tables[0].rows[0], tables[0].rows[0]] }],
        snapshotTableKey(tables[0]),
        'id',
      ),
    ).toThrow('Duplicate fields');
    expect(() => analyzeFieldImpact(tables, snapshotTableKey(tables[0]), 'ID')).toThrow(
      'existing field',
    );
  });
  it('finds partition identifiers without matching SQL literals or function names', () => {
    const [table] = instantiateBusinessModule('rbac', 'mysql', '', 'integer');
    table.rows.push({
      id: 'created',
      fieldName: 'created_at',
      fieldType: 'timestamp',
      fieldComment: '',
      nullable: false,
    });
    table.mysqlPartitionConfig = {
      enabled: true,
      type: 'HASH',
      columns: [],
      expression: "YEAR(created_at) + LENGTH('username id')",
    };
    expect(analyzeFieldImpact([table], snapshotTableKey(table), 'created_at').dependencies).toEqual(
      [expect.objectContaining({ kind: 'mysqlPartition' })],
    );
    expect(
      analyzeFieldImpact([table], snapshotTableKey(table), 'username').dependencies.every(
        (item) => item.kind === 'index',
      ),
    ).toBe(true);
    table.mysqlPartitionConfig.columns = ['id'];
    expect(
      analyzeFieldImpact([table], snapshotTableKey(table), 'id').dependencies.at(-1)?.kind,
    ).toBe('mysqlPartition');
    table.mysqlPartitionConfig.enabled = false;
    expect(analyzeFieldImpact([table], snapshotTableKey(table), 'created_at').dependencies).toEqual(
      [],
    );
  });
  it('includes Citus distribution, Hive partitions and clustering', () => {
    const [base] = instantiateBusinessModule('rbac', 'postgresql', '', 'integer');

    const citus = {
      ...base,
      dbType: 'postgresql-citus' as const,
      citusShardingConfig: { mode: 'distributed' as const, distributionColumn: 'id' },
    };
    expect(
      analyzeFieldImpact([citus], snapshotTableKey(citus), 'id').dependencies.at(-1)?.kind,
    ).toBe('citusDistribution');

    const hive = {
      ...base,
      dbType: 'hive' as const,
      tableMiscConfig: {
        enabled: true,
        partitions: {
          enabled: true,
          columns: [{ name: 'day', type: 'string', comment: '' }],
          clustering: { enabled: true, columns: ['id'], bucketCount: 4 },
        },
      },
    };
    expect(impactFieldNames(hive)).toContain('day');
    expect(analyzeFieldImpact([hive], snapshotTableKey(hive), 'day').dependencies[0].kind).toBe(
      'hivePartition',
    );
    expect(
      analyzeFieldImpact([hive], snapshotTableKey(hive), 'id').dependencies.at(-1),
    ).toMatchObject({ kind: 'hiveClustering', detail: '4 BUCKETS' });
  });
  it('reports self references once and rejects stale selections', () => {
    const [table] = instantiateBusinessModule('rbac', 'mysql', '', 'integer');
    table.foreignKeys = [
      { id: 'self', name: 'self', fields: ['id'], refTable: 'users', refFields: ['id'] },
    ];
    const report = analyzeFieldImpact([table], snapshotTableKey(table), 'id');
    expect(report.dependencies).toHaveLength(2);
    expect(report.dependencies[1].direction).toBe('self');
    expect(() => analyzeFieldImpact([], snapshotTableKey(table), 'id')).toThrow('Select a table');
    expect(() => analyzeFieldImpact([table], snapshotTableKey(table), 'removed')).toThrow(
      'existing field',
    );
  });
});
