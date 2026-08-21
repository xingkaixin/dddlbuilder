import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useSchemaApplyActions } from '@/components/App/hooks/useSchemaApplyActions';
import type { ParsedResult } from '@/utils/SqlParser';

function createHook(initialState: Partial<Parameters<typeof useSchemaApplyActions>[0]> = {}) {
  const spies = {
    setRows: vi.fn(),
    setIndexes: vi.fn(),
    setForeignKeys: vi.fn(),
    setReviewResult: vi.fn(),
    setIndexInput: vi.fn(),
    setAuthObjects: vi.fn(),
    setAuthInput: vi.fn(),
    setSchemaName: vi.fn(),
    setTableName: vi.fn(),
    setTableComment: vi.fn(),
    setDbType: vi.fn(),
    setTableMiscConfig: vi.fn(),
    setMysqlPartitionConfig: vi.fn(),
    setActiveTab: vi.fn(),
    triggerIndexAnimation: vi.fn(),
    triggerFieldTableHighlight: vi.fn(),
    showToast: vi.fn(),
  };

  const hook = renderHook(
    (props) =>
      useSchemaApplyActions({
        rows: [],
        indexes: [],
        reviewResult: null,
        dbType: 'mysql',
        sqlFormatMode: 'compact',
        ...initialState,
        ...props,
        ...spies,
      }),
    { initialProps: initialState },
  );

  return {
    hook,
    spies,
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

  describe('handleApplySuggestion', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should ignore already applied suggestions', () => {
      const { hook, spies } = createHook();
      act(() => {
        hook.result.current.handleApplySuggestion({
          id: '1',
          type: 'add_field',
          description: 'test',
          applied: true,
        } as any);
      });
      expect(spies.setActiveTab).not.toHaveBeenCalled();
    });

    it('should apply add_field suggestion', () => {
      const { hook, spies } = createHook({
        rows: [],
        reviewResult: {
          suggestions: [{ id: 's1', type: 'add_field', description: 'Add field' }],
        } as any,
      });

      act(() => {
        hook.result.current.handleApplySuggestion({
          id: 's1',
          type: 'add_field',
          description: 'Add field',
          field: { fieldName: 'new_col', fieldType: 'INT' },
        } as any);
      });

      expect(spies.setActiveTab).toHaveBeenCalledWith('fields');
      const setRowsUpdater = spies.setRows.mock.calls[0][0];
      const newRows = setRowsUpdater([]);
      expect(newRows).toHaveLength(1);
      expect(newRows[0].fieldName).toBe('new_col');
      expect(newRows[0].nullable).toBe(true);
      expect(newRows[0].defaultKind).toBe('none');

      expect(spies.triggerFieldTableHighlight).toHaveBeenCalledWith(0);
      expect(spies.showToast).toHaveBeenCalledWith('已应用建议：Add field');
      expect(spies.setReviewResult).toHaveBeenCalledWith({
        suggestions: [
          {
            id: 's1',
            type: 'add_field',
            description: 'Add field',
            applied: true,
          },
        ],
      });
    });

    it('should apply modify_field suggestion', () => {
      const { hook, spies } = createHook({
        rows: [
          {
            order: 1,
            fieldName: 'col1',
            fieldType: 'VARCHAR',
            fieldComment: '',
            nullable: true,
            defaultKind: 'none',
            defaultValue: '',
            onUpdate: 'none',
          },
        ],
        reviewResult: { suggestions: [{ id: 's2' }] } as any,
      });

      act(() => {
        hook.result.current.handleApplySuggestion({
          id: 's2',
          type: 'modify_field',
          description: 'Modify field',
          fieldModification: {
            fieldName: 'col1',
            changes: { fieldType: 'INT' },
          },
        } as any);
      });

      expect(spies.setActiveTab).toHaveBeenCalledWith('fields');
      const setRowsUpdater = spies.setRows.mock.calls[0][0];
      const prevRows = [{ order: 1, fieldName: 'col1', fieldType: 'VARCHAR' }];
      const newRows = setRowsUpdater(prevRows);
      expect(newRows[0].fieldType).toBe('INT');
      expect(spies.triggerFieldTableHighlight).toHaveBeenCalledWith(0);
    });

    it('should apply remove_field suggestion', () => {
      const { hook, spies } = createHook({
        rows: [
          {
            order: 1,
            fieldName: 'col1',
            fieldType: 'VARCHAR',
            fieldComment: '',
            nullable: true,
            defaultKind: 'none',
            defaultValue: '',
            onUpdate: 'none',
          },
        ],
      });

      act(() => {
        hook.result.current.handleApplySuggestion({
          id: 's3',
          type: 'remove_field',
          description: 'Remove col1',
          fieldName: 'col1',
        } as any);
      });

      expect(spies.triggerFieldTableHighlight).toHaveBeenCalledWith(0);
      act(() => {
        vi.advanceTimersByTime(500);
      });

      const setRowsUpdater = spies.setRows.mock.calls[0][0];
      const newRows = setRowsUpdater([{ order: 1, fieldName: 'col1', fieldType: 'VARCHAR' }]);
      expect(newRows).toHaveLength(0);
    });

    it('should apply add_index suggestion', () => {
      const { hook, spies } = createHook({
        indexes: [],
      });

      act(() => {
        hook.result.current.handleApplySuggestion({
          id: 's4',
          type: 'add_index',
          description: 'Add index',
          index: {
            name: 'idx_1',
            fields: [{ name: 'col1', direction: 'ASC' }],
            unique: true,
          },
        } as any);
      });

      expect(spies.setActiveTab).toHaveBeenCalledWith('indexes');
      const setIndexesUpdater = spies.setIndexes.mock.calls[0][0];
      const newIndexes = setIndexesUpdater([]);
      expect(newIndexes).toHaveLength(1);
      expect(newIndexes[0].name).toBe('idx_1');
      expect(newIndexes[0].unique).toBe(true);
      expect(newIndexes[0].id).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(spies.triggerIndexAnimation).toHaveBeenCalledWith(newIndexes[0].id, 'add');
    });

    it('should apply remove_index suggestion', () => {
      const { hook, spies } = createHook({
        indexes: [{ id: 'idx_1_id', name: 'idx_1', fields: [], unique: false }],
      });

      act(() => {
        hook.result.current.handleApplySuggestion({
          id: 's5',
          type: 'remove_index',
          description: 'Remove index',
          indexName: 'idx_1',
        } as any);
      });

      expect(spies.triggerIndexAnimation).toHaveBeenCalledWith('idx_1_id', 'remove');
      act(() => {
        vi.advanceTimersByTime(500);
      });

      const setIndexesUpdater = spies.setIndexes.mock.calls[0][0];
      const newIndexes = setIndexesUpdater([
        { id: 'idx_1_id', name: 'idx_1', fields: [], unique: false },
      ]);
      expect(newIndexes).toHaveLength(0);
    });

    it('should show toast when add_field is missing field data', () => {
      const { hook, spies } = createHook();

      act(() => {
        hook.result.current.handleApplySuggestion({
          id: 's1',
          type: 'add_field',
          description: 'Add field',
        } as any);
      });

      expect(spies.showToast).toHaveBeenCalledWith('该建议缺少字段信息，无法自动应用');
      expect(spies.setRows).not.toHaveBeenCalled();
    });

    it('should show toast when modify_field target is not found', () => {
      const { hook, spies } = createHook({
        rows: [{ order: 1, fieldName: 'col1', fieldType: 'VARCHAR' }],
      });

      act(() => {
        hook.result.current.handleApplySuggestion({
          id: 's2',
          type: 'modify_field',
          description: 'Modify field',
          fieldModification: {
            fieldName: 'nonexistent',
            changes: { fieldType: 'INT' },
          },
        } as any);
      });

      expect(spies.showToast).toHaveBeenCalledWith('未找到字段 "nonexistent"，无法应用修改');
      expect(spies.setRows).not.toHaveBeenCalled();
    });

    it('should show toast when remove_field target is not found', () => {
      const { hook, spies } = createHook({
        rows: [{ order: 1, fieldName: 'col1', fieldType: 'VARCHAR' }],
      });

      act(() => {
        hook.result.current.handleApplySuggestion({
          id: 's3',
          type: 'remove_field',
          description: 'Remove field',
          fieldName: 'nonexistent',
        } as any);
      });

      expect(spies.showToast).toHaveBeenCalledWith('未找到字段 "nonexistent"，无法删除');
    });

    it('should show toast for performance_warning suggestion', () => {
      const { hook, spies } = createHook();

      act(() => {
        hook.result.current.handleApplySuggestion({
          id: 's6',
          type: 'performance_warning',
          description: 'Performance issue',
          actionable: true,
        } as any);
      });

      expect(spies.showToast).toHaveBeenCalledWith('该类型建议不支持自动应用，请手动调整');
    });

    it('should show toast for general suggestion', () => {
      const { hook, spies } = createHook();

      act(() => {
        hook.result.current.handleApplySuggestion({
          id: 's7',
          type: 'general',
          description: 'General suggestion',
          actionable: true,
        } as any);
      });

      expect(spies.showToast).toHaveBeenCalledWith('该类型建议不支持自动应用，请手动调整');
    });
  });

  describe('handleImport edge cases', () => {
    it('should handle different Nullable and defaultKind fields', () => {
      const { hook, spies } = createHook();
      const result: ParsedResult = {
        tableName: 'test',
        tableComment: '',
        fields: [
          {
            name: 'f1',
            type: 'INT',
            comment: '',
            nullable: false,
            defaultKind: 'auto_increment',
            defaultValue: '',
          },
          {
            name: 'f2',
            type: 'INT',
            comment: '',
            nullable: true,
            defaultKind: 'constant',
            defaultValue: '1',
          },
          {
            name: 'f3',
            type: 'DATETIME',
            comment: '',
            nullable: false,
            defaultKind: 'current_timestamp',
            defaultValue: '',
            onUpdate: 'current_timestamp',
          },
          {
            name: 'f4',
            type: 'VARCHAR',
            comment: '',
            nullable: true,
            defaultKind: 'uuid',
            defaultValue: '',
          },
          {
            name: 'f5',
            type: 'VARCHAR',
            comment: '',
            nullable: true,
            defaultKind: 'none',
            defaultValue: '',
          },
        ],
        indexes: [],
        authObjects: [],
      };

      act(() => {
        hook.result.current.handleImport(result, 'mysql');
      });

      const rows = spies.setRows.mock.calls[0][0];
      expect(rows[0].nullable).toBe(false);
      expect(rows[0].defaultKind).toBe('auto_increment');

      expect(rows[1].nullable).toBe(true);
      expect(rows[1].defaultKind).toBe('constant');

      expect(rows[2].defaultKind).toBe('current_timestamp');
      expect(rows[2].onUpdate).toBe('current_timestamp');

      expect(rows[3].defaultKind).toBe('uuid');

      expect(rows[4].defaultKind).toBe('none');
      expect(rows.length).toBe(12); // padded to 12
    });
  });

  describe('handleApplyAIGeneratedSchema', () => {
    it('should set schemas properly when fields and indexes are provided', () => {
      const { hook, spies } = createHook();
      act(() => {
        hook.result.current.handleApplyAIGeneratedSchema({
          tableName: 'ai_table',
          tableComment: 'AI Generated',
          fields: [
            {
              fieldName: 'id',
              fieldType: 'INT',
              fieldComment: '',
              nullable: false,
              defaultKind: 'none',
              isPrimaryKey: true,
            },
            {
              fieldName: 'name',
              fieldType: 'VARCHAR',
              fieldComment: '',
              nullable: true,
              defaultKind: 'none',
              isPrimaryKey: false,
            },
          ],
          indexes: [
            {
              name: 'idx_name',
              fields: [{ name: 'name', direction: 'ASC' }],
              unique: false,
            },
          ],
        });
      });

      expect(spies.setTableName).toHaveBeenCalledWith('ai_table');
      expect(spies.setTableComment).toHaveBeenCalledWith('AI Generated');
      expect(spies.setRows).toHaveBeenCalledWith([
        {
          id: expect.any(String),
          order: 1,
          fieldName: 'id',
          fieldType: 'INT',
          fieldComment: '',
          nullable: false,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
        {
          id: expect.any(String),
          order: 2,
          fieldName: 'name',
          fieldType: 'VARCHAR',
          fieldComment: '',
          nullable: true,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
      ]);
      const indexes = spies.setIndexes.mock.calls[0][0];
      expect(indexes).toHaveLength(2); // PK autogenerated + idx_name
      expect(indexes[0].name).toBe('PRIMARY');
      expect(indexes[0].fields[0].name).toBe('id');
      expect(indexes[1].name).toBe('idx_name');
    });

    it('should hand generated state to draft creator when provided', () => {
      const onApplyAIGeneratedState = vi.fn();
      const { hook } = createHook({ onApplyAIGeneratedState });

      act(() => {
        hook.result.current.handleApplyAIGeneratedSchema({
          tableName: 'ai_table',
          tableComment: 'AI Generated',
          fields: [
            {
              fieldName: 'id',
              fieldType: 'INT',
              fieldComment: '',
              nullable: false,
              defaultKind: 'none',
              isPrimaryKey: true,
            },
          ],
          indexes: [
            {
              name: 'idx_id',
              fields: [{ name: 'id', direction: 'ASC' }],
              unique: false,
            },
          ],
        });
      });

      expect(onApplyAIGeneratedState).toHaveBeenCalledWith(
        expect.objectContaining({
          objectType: 'table',
          tableName: 'ai_table',
          tableComment: 'AI Generated',
          dbType: 'mysql',
          sqlFormatMode: 'compact',
          rows: [expect.objectContaining({ fieldName: 'id' })],
          indexes: expect.arrayContaining([expect.objectContaining({ name: 'PRIMARY' })]),
        }),
      );
    });
  });
});
