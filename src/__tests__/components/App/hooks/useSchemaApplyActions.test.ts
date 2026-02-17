import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSchemaApplyActions } from '@/components/App/hooks/useSchemaApplyActions';
import type { ParsedResult } from '@/utils/SqlParser';

function createHook() {
  const setRows = vi.fn();
  const setIndexes = vi.fn();
  const setReviewResult = vi.fn();
  const setIndexInput = vi.fn();
  const setAuthObjects = vi.fn();
  const setAuthInput = vi.fn();
  const setTableName = vi.fn();
  const setTableComment = vi.fn();
  const setDbType = vi.fn();
  const setTableMiscConfig = vi.fn();
  const setMysqlPartitionConfig = vi.fn();
  const setActiveTab = vi.fn();
  const triggerIndexAnimation = vi.fn();
  const triggerFieldTableHighlight = vi.fn();
  const showToast = vi.fn();
  const trackEvent = vi.fn().mockResolvedValue(undefined);

  const hook = renderHook(() =>
    useSchemaApplyActions({
      rows: [],
      indexes: [],
      reviewResult: null,
      setRows,
      setIndexes,
      setReviewResult,
      setIndexInput,
      setAuthObjects,
      setAuthInput,
      setTableName,
      setTableComment,
      setDbType,
      setTableMiscConfig,
      setMysqlPartitionConfig,
      setActiveTab,
      triggerIndexAnimation,
      triggerFieldTableHighlight,
      showToast,
      trackEvent,
    }),
  );

  return {
    hook,
    spies: {
      setRows,
      setIndexes,
      setAuthObjects,
      setTableMiscConfig,
      setMysqlPartitionConfig,
    },
  };
}

describe('useSchemaApplyActions', () => {
  it('导入 SQL 时应回填 MySQL 表级杂项配置', () => {
    const { hook, spies } = createHook();
    const result: ParsedResult = {
      tableName: 'COO_SC_RAT',
      tableComment: '证券公司评级1',
      fields: [],
      indexes: [],
      authObjects: [],
      tableMiscConfig: {
        enabled: true,
        engine: 'InnoDB',
        charset: 'utf8mb4',
        collation: 'utf8mb4_bin',
        tablespace: '',
      },
      mysqlPartitionConfig: {
        enabled: true,
        type: 'HASH',
        columns: ['ID'],
        partitionCount: 4,
        partitions: [],
      },
    };

    act(() => {
      hook.result.current.handleImport(result, 'mysql');
    });

    expect(spies.setTableMiscConfig).toHaveBeenCalledWith({
      enabled: true,
      engine: 'InnoDB',
      charset: 'utf8mb4',
      collation: 'utf8mb4_bin',
      tablespace: '',
    });
    expect(spies.setMysqlPartitionConfig).toHaveBeenCalledWith({
      enabled: true,
      type: 'HASH',
      columns: ['ID'],
      partitionCount: 4,
      partitions: [],
    });
  });

  it('导入未包含杂项配置时应重置为默认值', () => {
    const { hook, spies } = createHook();
    const result: ParsedResult = {
      tableName: 't_users',
      tableComment: '',
      fields: [],
      indexes: [],
      authObjects: [],
    };

    act(() => {
      hook.result.current.handleImport(result, 'mysql');
    });

    expect(spies.setTableMiscConfig).toHaveBeenCalledWith({
      enabled: false,
      engine: '',
      charset: '',
      collation: '',
      tablespace: '',
    });
    expect(spies.setMysqlPartitionConfig).toHaveBeenCalledWith({
      enabled: false,
      type: 'RANGE',
      columns: [],
      partitionCount: 4,
      partitions: [],
    });
  });
});
