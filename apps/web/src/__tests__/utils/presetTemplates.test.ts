import { describe, expect, it } from 'vitest';
import { buildDDL, buildORM, buildQualifiedTableName } from '@ddlbuilder/ddl-core';
import { buildNormalizedFields } from '@/stores/fieldStore';
import { getPresetDefinition } from '@/utils/presetTemplates';
import { resolvePresetLaunch } from '@/components/App/hooks/useUrlPresetLaunch';

describe('presetTemplates', () => {
  it('returns cloned state and valid DDL for each built-in preset', () => {
    const cases = [
      ['user-profile', 'CREATE TABLE user_profile'],
      ['mysql-partition', 'PARTITION BY RANGE COLUMNS'],
      ['postgresql-orders', 'CREATE TABLE app.payment_orders'],
      ['sql-to-er-prisma', 'CREATE TABLE orders'],
      ['mysql-er-orders', 'FOREIGN KEY'],
      ['dm-oracle', 'CREATE TABLE OA.approval_records'],
      ['pg-citus', 'create_distributed_table'],
    ] as const;

    for (const [id, expectedSnippet] of cases) {
      const preset = getPresetDefinition(id);

      if (!preset) {
        throw new Error(`Expected preset ${id} to exist`);
      }

      const { state } = preset;

      const ddl = buildDDL({
        dbType: state.dbType,
        tableName: buildQualifiedTableName(state.schemaName, state.tableName, state.dbType),
        tableComment: state.tableComment,
        fields: buildNormalizedFields(state.rows),
        indexes: state.indexes,
        sqlFormatMode: state.sqlFormatMode,
        citusShardingConfig: state.citusShardingConfig,
        mysqlPartitionConfig: state.mysqlPartitionConfig,
        tableMiscConfig: state.tableMiscConfig,
        foreignKeys: state.foreignKeys,
      });

      expect(ddl).toContain(expectedSnippet);
    }

    const prismaPreset = getPresetDefinition('sql-to-er-prisma');

    if (!prismaPreset) {
      throw new Error('Expected sql-to-er-prisma preset to exist');
    }

    const prismaCode = buildORM('prisma', {
      dbType: prismaPreset.state.dbType,
      schemaName: prismaPreset.state.schemaName,
      tableName: prismaPreset.state.tableName,
      tableComment: prismaPreset.state.tableComment,
      fields: buildNormalizedFields(prismaPreset.state.rows),
      indexes: prismaPreset.state.indexes,
      foreignKeys: prismaPreset.state.foreignKeys,
    });
    expect(prismaCode).toContain('model Orders');
    expect(prismaCode).toContain('@@map("orders")');
    expect(prismaCode).not.toContain('Manual mapping required');
  });

  it('parses URL launch parameters while preserving unrelated query params', () => {
    const launch = resolvePresetLaunch('?preset=mysql-partition&utm_source=docs&tab=indexes');
    expect(launch?.preset.id).toBe('mysql-partition');
    expect(launch?.activeTab).toBe('indexes');
    expect(launch?.outputTab).toBeUndefined();
    expect(launch?.remainingSearch).toBe('utm_source=docs');

    const prismaLaunch = resolvePresetLaunch('?preset=sql-to-er-prisma');
    expect(prismaLaunch?.outputTab).toBe('orm');
    expect(prismaLaunch?.remainingSearch).toBe('');

    expect(resolvePresetLaunch('?preset=unknown')).toBeNull();
  });
});
