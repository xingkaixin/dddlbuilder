import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { useWorkspacePresentation } from '@/components/App/hooks/useWorkspacePresentation';
import type { WorkspaceTab } from '@/stores';

const createState = (tableName: string): PersistedState => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 10,
  indexes: [],
  authInput: '',
  authObjects: [],
});

const tabs: WorkspaceTab[] = [
  { id: 'active', source: { kind: 'draft', draftId: 'a' }, stateSnapshot: createState('stale') },
  {
    id: 'background',
    source: { kind: 'draft', draftId: 'b' },
    stateSnapshot: createState('orders'),
  },
  { id: 'empty', source: { kind: 'draft', draftId: 'c' }, stateSnapshot: createState('  ') },
  {
    id: 'saved',
    source: { kind: 'saved_table', normalizedName: 'users', tableName: 'Users', baseSignature: '' },
    stateSnapshot: createState('edited_users'),
  },
];

describe('useWorkspacePresentation', () => {
  it('当前草稿标题取实时表名，其余草稿取快照，已保存表取表名', () => {
    const { result } = renderHook(() =>
      useWorkspacePresentation({
        activeSourceKind: 'draft',
        activeTabId: 'active',
        activeTableName: 'live_name',
        activeWorkspaceTab: tabs[0],
        draftSummaries: [],
        hydrated: true,
        isLoadedDirty: false,
        savedTables: [],
        tabs,
      }),
    );

    expect(Object.fromEntries(result.current.tabTitles)).toEqual({
      active: 'live_name',
      background: 'orders',
      empty: '未命名草稿',
      saved: 'Users',
    });
  });
});
