import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FieldRow, IndexDefinition, PersistedState } from '@ddlbuilder/shared-types';
import { useAISchemaPatchFlow } from '@/components/App/hooks/useAISchemaPatchFlow';
import { buildAISchemaChanges } from '@/utils/aiSchemaChanges';

const row = (fieldName: string, order: number): FieldRow => ({
  id: `field-${order}`,
  fieldName,
  fieldType: 'bigint',
  fieldComment: '',
  nullable: false,
});

const oldIndex: IndexDefinition = {
  id: 'old-index',
  name: 'idx_users_email',
  fields: [{ name: 'email', direction: 'ASC' }],
  kind: 'index',
};

const createState = (): PersistedState => ({
  objectType: 'table',
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [row('id', 1)],
  addCount: 10,
  indexes: [oldIndex],
  authInput: '',
  authObjects: [],
});

const createDependencies = () => ({
  currentState: createState(),
  applyState: vi.fn(),
  setActiveTab: vi.fn(),
  highlightField: vi.fn(),
  animateIndex: vi.fn(),
});

describe('useAISchemaPatchFlow', () => {
  it('rejects accepted changes after a concurrent edit without overwriting it', () => {
    const base = { ...createState(), indexes: [] };
    const candidate = { ...base, rows: base.rows.map((field) => ({ ...field, fieldType: 'int' })) };

    const current = {
      ...base,
      rows: base.rows.map((field) => ({
        ...field,
        nullable: true,
        fieldComment: 'remote comment',
      })),
    };
    const dependencies = { ...createDependencies(), currentState: current };
    const { result } = renderHook(() => useAISchemaPatchFlow(dependencies));
    expect(() =>
      result.current.applyChanges(buildAISchemaChanges(base, candidate), candidate, base),
    ).toThrow('表结构已发生变化，请基于当前内容重新生成建议。');
    expect(dependencies.applyState).not.toHaveBeenCalled();
  });
});
