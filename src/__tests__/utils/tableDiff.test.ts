import { describe, it, expect } from 'vitest';
import { diffPersistedState } from '@/utils/tableDiff';
import type { PersistedState, IndexDefinition } from '@/types';

function createState(overrides: Partial<PersistedState> = {}): PersistedState {
  return {
    tableName: 'users',
    tableComment: '',
    dbType: 'mysql',
    rows: [],
    addCount: 10,
    indexInput: '',
    currentIndexFields: [],
    indexes: [],
    authInput: '',
    authObjects: [],
    ...overrides,
  };
}

function createRow({
  name,
  type = 'VARCHAR(100)',
  comment = '',
  nullable = '是',
  defaultKind = '无',
  defaultValue = '',
  onUpdate = '无',
}: {
  name: string;
  type?: string;
  comment?: string;
  nullable?: string;
  defaultKind?: string;
  defaultValue?: string;
  onUpdate?: string;
}) {
  return {
    order: 1,
    fieldName: name,
    fieldType: type,
    fieldComment: comment,
    nullable,
    defaultKind,
    defaultValue,
    onUpdate,
  };
}

describe('diffPersistedState', () => {
  describe('无变更情况', () => {
    it('相同状态返回无变更', () => {
      const state = createState({
        rows: [createRow({ name: 'id', type: 'BIGINT' })],
      });
      const result = diffPersistedState(state, state);
      expect(result.hasChanges).toBe(false);
      expect(result.fields).toHaveLength(0);
      expect(result.indexes).toHaveLength(0);
    });

    it('空状态返回无变更', () => {
      const state = createState();
      const result = diffPersistedState(state, state);
      expect(result.hasChanges).toBe(false);
    });
  });

  describe('表名变更', () => {
    it('检测表名变更', () => {
      const old = createState({ tableName: 'user' });
      const newState = createState({ tableName: 'users' });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.tableNameChanged).toBe(true);
      expect(result.oldTableName).toBe('user');
      expect(result.newTableName).toBe('users');
    });
  });

  describe('表注释变更', () => {
    it('检测表注释变更', () => {
      const old = createState({ tableComment: '用户表' });
      const newState = createState({ tableComment: '用户信息表' });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.tableCommentChanged).toBe(true);
      expect(result.oldTableComment).toBe('用户表');
      expect(result.newTableComment).toBe('用户信息表');
    });
  });

  describe('杂项设置变更', () => {
    it('检测杂项启用状态变更', () => {
      const old = createState({
        tableMiscConfig: { enabled: false },
      });
      const newState = createState({
        tableMiscConfig: { enabled: true, engine: 'InnoDB' },
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.miscConfigChanged).toBe(true);
      expect(result.newMiscConfig?.enabled).toBe(true);
    });
  });

  describe('字段变更', () => {
    it('检测新增字段', () => {
      const old = createState({
        rows: [createRow({ name: 'id', type: 'BIGINT' })],
      });
      const newState = createState({
        rows: [
          createRow({ name: 'id', type: 'BIGINT' }),
          createRow({ name: 'name', type: 'VARCHAR(50)' }),
        ],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].type).toBe('add');
      expect(result.fields[0].fieldName).toBe('name');
    });

    it('检测删除字段', () => {
      const old = createState({
        rows: [
          createRow({ name: 'id', type: 'BIGINT' }),
          createRow({ name: 'name', type: 'VARCHAR(50)' }),
        ],
      });
      const newState = createState({
        rows: [createRow({ name: 'id', type: 'BIGINT' })],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].type).toBe('remove');
      expect(result.fields[0].fieldName).toBe('name');
    });

    it('检测字段类型修改', () => {
      const old = createState({
        rows: [createRow({ name: 'name', type: 'VARCHAR(50)' })],
      });
      const newState = createState({
        rows: [createRow({ name: 'name', type: 'VARCHAR(100)' })],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].type).toBe('modify');
      expect(result.fields[0].changes).toContain('type');
    });

    it('检测字段 nullable 修改', () => {
      const old = createState({
        rows: [createRow({ name: 'name', nullable: '是' })],
      });
      const newState = createState({
        rows: [createRow({ name: 'name', nullable: '否' })],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.fields[0].type).toBe('modify');
      expect(result.fields[0].changes).toContain('nullable');
    });

    it('检测字段注释修改', () => {
      const old = createState({
        rows: [createRow({ name: 'name', comment: '姓名' })],
      });
      const newState = createState({
        rows: [createRow({ name: 'name', comment: '用户姓名' })],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.fields[0].type).toBe('modify');
      expect(result.fields[0].changes).toContain('comment');
    });

    it('字段名不区分大小写', () => {
      const old = createState({
        rows: [createRow({ name: 'Name', type: 'VARCHAR(50)' })],
      });
      const newState = createState({
        rows: [createRow({ name: 'name', type: 'VARCHAR(100)' })],
      });
      const result = diffPersistedState(old, newState);
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].type).toBe('modify');
    });

    it('忽略空字段行', () => {
      const old = createState({
        rows: [
          createRow({ name: 'id', type: 'BIGINT' }),
          createRow({ name: '', type: '' }), // 空行
        ],
      });
      const newState = createState({
        rows: [createRow({ name: 'id', type: 'BIGINT' })],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(false);
    });

    it('检测字段重命名（相同类型和注释）', () => {
      const old = createState({
        rows: [
          createRow({
            name: 'old_name',
            type: 'VARCHAR(50)',
            comment: '用户名',
          }),
        ],
      });
      const newState = createState({
        rows: [
          createRow({
            name: 'new_name',
            type: 'VARCHAR(50)',
            comment: '用户名',
          }),
        ],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0].type).toBe('rename');
      expect(result.fields[0].oldFieldName).toBe('old_name');
      expect(result.fields[0].newFieldName).toBe('new_name');
    });

    it('不同类型不视为重命名', () => {
      const old = createState({
        rows: [
          createRow({ name: 'old_name', type: 'VARCHAR(50)', comment: '字段' }),
        ],
      });
      const newState = createState({
        rows: [createRow({ name: 'new_name', type: 'INT', comment: '字段' })],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.fields).toHaveLength(2);
      expect(result.fields.some((f) => f.type === 'remove')).toBe(true);
      expect(result.fields.some((f) => f.type === 'add')).toBe(true);
    });

    it('不同注释不视为重命名', () => {
      const old = createState({
        rows: [
          createRow({
            name: 'old_name',
            type: 'VARCHAR(50)',
            comment: '旧注释',
          }),
        ],
      });
      const newState = createState({
        rows: [
          createRow({
            name: 'new_name',
            type: 'VARCHAR(50)',
            comment: '新注释',
          }),
        ],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.fields).toHaveLength(2);
      expect(result.fields.some((f) => f.type === 'remove')).toBe(true);
      expect(result.fields.some((f) => f.type === 'add')).toBe(true);
    });

    it('处理不同 defaultKind(uuid) 与 onUpdate(当前时间/current_timestamp) 变更', () => {
      const old = createState({
        rows: [
          createRow({ name: 'f1', defaultKind: 'uuid', onUpdate: '当前时间' }),
          createRow({
            name: 'f2',
            defaultKind: '无',
            onUpdate: 'current_timestamp',
          }),
        ],
      });
      const newState = createState({
        rows: [
          createRow({ name: 'f1', defaultKind: 'uuid', onUpdate: '无' }),
          createRow({ name: 'f2', defaultKind: '常量', onUpdate: '无' }),
        ],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.fields[0].changes).toContain('default');
      expect(result.fields[1].changes).toContain('default');
    });

    it('重命名时如果还存在其他非注释变更，也应该被包含', () => {
      const old = createState({
        rows: [
          createRow({
            name: 'old_name',
            type: 'INT',
            comment: '测试',
            nullable: '是',
          }),
        ],
      });
      const newState = createState({
        rows: [
          createRow({
            name: 'new_name',
            type: 'INT',
            comment: '测试',
            nullable: '否',
          }),
        ],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.fields[0].type).toBe('rename');
      expect(result.fields[0].changes).toContain('nullable');
    });
  });

  describe('索引变更', () => {
    const createIndex = (
      overrides: Partial<IndexDefinition>,
    ): IndexDefinition => ({
      id: '1',
      name: 'idx_test',
      fields: [{ name: 'id', direction: 'ASC' }],
      unique: false,
      ...overrides,
    });

    it('检测新增索引', () => {
      const old = createState({ indexes: [] });
      const newState = createState({
        indexes: [createIndex({ name: 'idx_id' })],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.indexes).toHaveLength(1);
      expect(result.indexes[0].type).toBe('add');
    });

    it('检测删除索引', () => {
      const old = createState({
        indexes: [createIndex({ name: 'idx_id' })],
      });
      const newState = createState({ indexes: [] });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.indexes).toHaveLength(1);
      expect(result.indexes[0].type).toBe('remove');
    });

    it('相同索引不报变更', () => {
      const idx = createIndex({ name: 'idx_id' });
      const old = createState({ indexes: [idx] });
      const newState = createState({ indexes: [{ ...idx }] });
      const result = diffPersistedState(old, newState);
      expect(result.indexes).toHaveLength(0);
    });

    it('索引字段顺序变化视为变更', () => {
      const old = createState({
        indexes: [
          createIndex({
            fields: [
              { name: 'a', direction: 'ASC' },
              { name: 'b', direction: 'ASC' },
            ],
          }),
        ],
      });
      const newState = createState({
        indexes: [
          createIndex({
            fields: [
              { name: 'b', direction: 'ASC' },
              { name: 'a', direction: 'ASC' },
            ],
          }),
        ],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.indexes).toHaveLength(2);
    });

    it('索引方向变化视为变更', () => {
      const old = createState({
        indexes: [createIndex({ fields: [{ name: 'id', direction: 'ASC' }] })],
      });
      const newState = createState({
        indexes: [createIndex({ fields: [{ name: 'id', direction: 'DESC' }] })],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
    });

    it('主键变更检测', () => {
      const old = createState({
        indexes: [createIndex({ isPrimary: true, name: 'pk_users' })],
      });
      const newState = createState({
        indexes: [
          createIndex({
            isPrimary: true,
            name: 'pk_users',
            fields: [
              { name: 'id', direction: 'ASC' },
              { name: 'tenant_id', direction: 'ASC' },
            ],
          }),
        ],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
    });
  });

  describe('混合变更', () => {
    it('同时检测字段和索引变更', () => {
      const old = createState({
        rows: [createRow({ name: 'id', type: 'BIGINT' })],
        indexes: [],
      });
      const newState = createState({
        rows: [
          createRow({ name: 'id', type: 'BIGINT' }),
          createRow({ name: 'name', type: 'VARCHAR(50)' }),
        ],
        indexes: [
          {
            id: '1',
            name: 'idx_name',
            fields: [{ name: 'name', direction: 'ASC' }],
            unique: false,
          },
        ],
      });
      const result = diffPersistedState(old, newState);
      expect(result.hasChanges).toBe(true);
      expect(result.fields.filter((f) => f.type === 'add')).toHaveLength(1);
      expect(result.indexes.filter((i) => i.type === 'add')).toHaveLength(1);
    });
  });
});
