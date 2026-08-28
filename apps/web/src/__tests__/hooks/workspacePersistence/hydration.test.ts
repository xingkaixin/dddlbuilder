import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSessionRecord } from '@/utils/workspaceStateDb';
import {
  collectBootstrapDrafts,
  pickInitialDraft,
  resolveWorkspaceHydration,
  toDraftSummary,
  toHydrationSavedTable,
  type DraftEntry,
  type HydrationSavedTable,
} from '@/hooks/workspacePersistence/hydration';

const createState = (tableName: string): PersistedState => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [
    {
      order: 1,
      fieldName: 'id',
      fieldType: 'bigint',
      fieldComment: '',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
  ],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
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
  activeState: PersistedState | null = null,
): WorkspaceSessionRecord => ({ activeSource, activeState, updatedAt: 1 });

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
  it('pickInitialDraft 应优先 default draft，否则取最新创建的', () => {
    const drafts = [createDraft('a', 'a', 100), createDraft('default', 'd', 1)];
    expect(pickInitialDraft(drafts)?.draftId).toBe('default');
    expect(pickInitialDraft([createDraft('a', 'a', 1), createDraft('b', 'b', 2)])?.draftId).toBe(
      'b',
    );
    expect(pickInitialDraft([])).toBeNull();
  });

  it('collectBootstrapDrafts 应合并 globalDraft 与其他草稿并保留记录', () => {
    const drafts = collectBootstrapDrafts({
      globalDraft: { state: createState('global'), createdAt: 1, updatedAt: 2 },
      drafts: [
        { draftId: 'default', record: { state: createState('dup'), updatedAt: 3 } },
        { draftId: 'a', record: { state: createState('a'), updatedAt: 3 } },
      ],
    });

    expect(drafts.map((draft) => draft.draftId)).toEqual(['default', 'a']);
    expect(drafts[0].record.state.tableName).toBe('global');
  });

  it('toDraftSummary 应从记录派生摘要', () => {
    const summary = toDraftSummary('a', {
      state: createState('users'),
      updatedAt: 20,
      folderId: 'f1',
      trashedAt: 30,
    });
    expect(summary).toMatchObject({
      draftId: 'a',
      name: 'users',
      fieldCount: 1,
      createdAt: 20,
      updatedAt: 20,
      folderId: 'f1',
      trashedAt: 30,
    });
  });

  it('toHydrationSavedTable 应抹平 SavedTableRecord 形状', () => {
    expect(toHydrationSavedTable(null)).toBeNull();
    expect(
      toHydrationSavedTable({ normalizedName: 'users', state: createState('users') }),
    ).toMatchObject({ normalizedName: 'users', tableName: '' });
  });

  it('无会话时应回退到 initial draft', () => {
    expect(
      resolveWorkspaceHydration({
        drafts: [createDraft('a', 'a', 1)],
        session: null,
        findSavedTable: noSavedTable,
      }),
    ).toMatchObject({ activeSource: { kind: 'draft', draftId: 'a' } });
  });

  it('无会话且无草稿时应回退到 default draft 与空状态', () => {
    expect(
      resolveWorkspaceHydration({ drafts: [], session: null, findSavedTable: noSavedTable }),
    ).toEqual({ activeSource: { kind: 'draft', draftId: 'default' }, state: null });
  });

  it('会话指向已保存表时应优先未保存草稿状态', () => {
    const draftState = createState('users_dirty');
    const result = resolveWorkspaceHydration({
      drafts: [],
      session: createSession(
        { kind: 'saved_table', normalizedName: 'users', tableName: 'Users', baseSignature: 'x' },
        createState('users_session'),
      ),
      findSavedTable: () => ({ ...savedTable, draftState }),
    });

    expect(result.activeSource).toMatchObject({ kind: 'saved_table', normalizedName: 'users' });
    expect(result.state).toEqual(draftState);
  });

  it('会话指向已保存表且无未保存草稿时应用 activeState', () => {
    const sessionState = createState('users_session');
    const result = resolveWorkspaceHydration({
      drafts: [],
      session: createSession(
        { kind: 'saved_table', normalizedName: 'users', tableName: 'Users', baseSignature: 'x' },
        sessionState,
      ),
      findSavedTable: () => savedTable,
    });
    expect(result.state).toEqual(sessionState);
  });

  it('会话指向的已保存表缺失时应回退到 initial draft', () => {
    const result = resolveWorkspaceHydration({
      drafts: [createDraft('default', 'fallback', 1)],
      session: createSession(
        { kind: 'saved_table', normalizedName: 'gone', tableName: 'Gone', baseSignature: 'x' },
        createState('orphan'),
      ),
      findSavedTable: noSavedTable,
    });

    expect(result.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
    expect(result.state?.tableName).toBe('fallback');
  });

  it('会话草稿存在时应优先草稿实体状态', () => {
    const result = resolveWorkspaceHydration({
      drafts: [createDraft('a', 'entity', 1)],
      session: createSession({ kind: 'draft', draftId: 'a' }, createState('session')),
      findSavedTable: noSavedTable,
    });
    expect(result.state?.tableName).toBe('entity');
  });

  it('会话草稿缺失且无其他草稿时应保留会话 id 与 activeState', () => {
    const sessionState = createState('session_only');
    const result = resolveWorkspaceHydration({
      drafts: [],
      session: createSession({ kind: 'draft', draftId: 'gone' }, sessionState),
      findSavedTable: noSavedTable,
    });

    expect(result.activeSource).toEqual({ kind: 'draft', draftId: 'gone' });
    expect(result.state).toEqual(sessionState);
  });
});
