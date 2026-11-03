import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { createFieldRow } from '@/__tests__/utils/testFactories';
import type { WorkspaceSessionRecord } from '@/utils/workspaceStateDb';
import {
  collectBootstrapDrafts,
  resolveWorkspaceHydration,
  type DraftEntry,
  type HydrationSavedTable,
} from '@/hooks/workspacePersistence/hydration';

const createState = (tableName: string): PersistedState => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [createFieldRow('field-id', { fieldType: 'bigint', nullable: false })],
  addCount: 10,
  indexes: [],
  authInput: '',
  authObjects: [],
});

const createDraft = (draftId: string, tableName: string, createdAt: number): DraftEntry => ({
  draftId,
  record: { state: createState(tableName), createdAt, updatedAt: createdAt + 1 },
});

const createSession = (
  activeSource: WorkspaceSessionRecord['activeSource'],
): WorkspaceSessionRecord => ({
  activeSource,
  updatedAt: 1,
});

const savedTable: HydrationSavedTable = {
  normalizedName: 'users',
  tableName: 'Users',
  state: createState('users_saved'),
};

const noSavedTable = () => null;

describe('workspacePersistence/hydration', () => {
  it('preserves draft folder and trash metadata during bootstrap', () => {
    const draft = createDraft('a', 'draft', 1);
    draft.record.folderId = 'folder-1';
    draft.record.trashedAt = 42;
    const [result] = collectBootstrapDrafts({ globalDraft: null, drafts: [draft] });
    expect(result.record).toMatchObject({ folderId: 'folder-1', trashedAt: 42 });
  });

  it('会话指向已保存表时应优先未保存草稿状态', () => {
    const draftState = createState('users_dirty');

    const result = resolveWorkspaceHydration({
      drafts: [],
      session: createSession({ kind: 'saved_table', normalizedName: 'users' }),
      findSavedTable: () => ({ ...savedTable, draftState }),
    });

    expect(result.activeSource).toMatchObject({ kind: 'saved_table', normalizedName: 'users' });
    expect(result.state).toEqual(draftState);
  });

  it('会话指向的已保存表缺失时应回退到 initial draft', () => {
    const result = resolveWorkspaceHydration({
      drafts: [createDraft('default', 'fallback', 1)],
      session: createSession({ kind: 'saved_table', normalizedName: 'gone' }),
      findSavedTable: noSavedTable,
    });

    expect(result.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
    expect(result.state?.tableName).toBe('fallback');
  });
});
