import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import {
  clearLocalWorkspaceData,
  syncWorkspaceOnce,
} from '@/services/workspaceIncrementalSyncService';
import { readDraft, writeDraft } from '@/utils/workspaceStateDb';
import { addSavedTable } from '@/utils/savedTablesDb';
import { bulkPutFolders, listFolders } from '@/utils/tableFolders';
import {
  enqueueWorkspaceOutboxItem,
  listWorkspaceConflicts,
  listWorkspaceOutboxItems,
  readWorkspaceSyncMeta,
  writeWorkspaceSyncMeta,
} from '@/utils/workspaceSyncStateDb';

const scope = {
  kind: 'user' as const,
  userId: 'user-1',
  workspaceId: 'ws-1',
};

const createState = (tableName: string) => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql' as const,
  sqlFormatMode: 'compact' as const,
  rows: [],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('workspaceIncrementalSyncService', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
    vi.clearAllMocks();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
    vi.restoreAllMocks();
  });

  it('拉取增量时应写入本地草稿并推进 cursor', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          workspaceId: 'ws-1',
          cursor: 1,
          entities: [
            {
              workspaceId: 'ws-1',
              entityType: 'draft',
              entityId: 'draft-1',
              version: 1,
              contentHash: 'sha256:draft',
              payload: {
                state: createState('cloud_draft'),
                createdAt: 100,
              },
              updatedAt: 120,
            },
          ],
        }),
      ),
    );

    const result = await syncWorkspaceOnce(scope);

    const draft = await readDraft('draft-1', scope);
    const meta = await readWorkspaceSyncMeta('ws-1');
    expect(result).toMatchObject({ status: 'synced', cursor: 1, conflictCount: 0 });
    expect(draft?.state.tableName).toBe('cloud_draft');
    expect(draft?.updatedAt).toBe(120);
    expect(meta?.cursor).toBe(1);
  });

  it('推送 outbox 成功后应出队', async () => {
    await enqueueWorkspaceOutboxItem({
      workspaceId: 'ws-1',
      entityType: 'draft',
      entityId: 'draft-1',
      op: 'upsert',
      contentHash: 'sha256:local',
      payload: {
        state: createState('local_draft'),
        createdAt: 100,
      },
    });
    const [queued] = await listWorkspaceOutboxItems('ws-1');

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ workspaceId: 'ws-1', cursor: 0, entities: [] })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            cursor: 1,
            accepted: [
              {
                clientMutationId: queued?.id,
                entityType: 'draft',
                entityId: 'draft-1',
                version: 1,
              },
            ],
            conflicts: [],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ workspaceId: 'ws-1', cursor: 1, entities: [] })),
      );

    const result = await syncWorkspaceOnce(scope);
    const outbox = await listWorkspaceOutboxItems('ws-1');
    const pushInit = fetchSpy.mock.calls[1]?.[1] as RequestInit | undefined;
    expect(pushInit).toBeDefined();
    const pushBody = JSON.parse(String(pushInit?.body));

    expect(pushBody.changes).toHaveLength(1);
    expect(pushBody.changes[0]).toMatchObject({
      entityType: 'draft',
      entityId: 'draft-1',
      op: 'upsert',
    });
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('/api/workspaces/ws-1/changes');
    expect(result).toMatchObject({ status: 'synced', cursor: 1, conflictCount: 0 });
    expect(outbox).toHaveLength(0);
  });

  it('推送冲突时应保留 outbox 并记录冲突', async () => {
    await enqueueWorkspaceOutboxItem({
      workspaceId: 'ws-1',
      entityType: 'draft',
      entityId: 'draft-1',
      op: 'upsert',
      contentHash: 'sha256:local',
      payload: {
        state: createState('local_draft'),
      },
    });
    const [queued] = await listWorkspaceOutboxItems('ws-1');

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ workspaceId: 'ws-1', cursor: 2, entities: [] })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            cursor: 2,
            accepted: [],
            conflicts: [
              {
                clientMutationId: queued?.id,
                entityType: 'draft',
                entityId: 'draft-1',
                serverVersion: 2,
                serverContentHash: 'sha256:server',
                serverPayload: { state: createState('server_draft') },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ workspaceId: 'ws-1', cursor: 2, entities: [] })),
      );

    const result = await syncWorkspaceOnce(scope);
    const outbox = await listWorkspaceOutboxItems('ws-1');
    const conflicts = await listWorkspaceConflicts('ws-1');

    expect(result).toMatchObject({ status: 'conflict', conflictCount: 1 });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.attemptCount).toBe(1);
    expect(conflicts[0]).toMatchObject({
      clientMutationId: queued?.id,
      entityType: 'draft',
      entityId: 'draft-1',
      serverVersion: 2,
    });
  });

  it('清理本地 workspace 数据时应只删除当前 workspace scope', async () => {
    const otherScope = { kind: 'user' as const, userId: 'user-1', workspaceId: 'ws-2' };
    await writeDraft('draft-1', { state: createState('local'), updatedAt: 1 }, scope);
    await writeDraft('draft-1', { state: createState('other'), updatedAt: 1 }, otherScope);
    await addSavedTable(
      {
        normalizedName: 'users',
        name: 'users',
        state: createState('users'),
        createdAt: 1,
        updatedAt: 1,
      },
      scope,
    );
    await bulkPutFolders([{ id: 'folder-1', name: 'Folder', order: 1, createdAt: 1 }], scope);
    await enqueueWorkspaceOutboxItem({
      workspaceId: 'ws-1',
      entityType: 'draft',
      entityId: 'draft-1',
      op: 'upsert',
      contentHash: 'sha256:local',
      payload: { state: createState('local') },
    });
    await writeWorkspaceSyncMeta({ id: 'ws-1', userId: 'user-1', cursor: 3 });

    await clearLocalWorkspaceData(scope);

    expect(await readDraft('draft-1', scope)).toBeNull();
    expect((await readDraft('draft-1', otherScope))?.state.tableName).toBe('other');
    expect(await listFolders(scope)).toEqual([]);
    expect(await listWorkspaceOutboxItems('ws-1')).toEqual([]);
    expect(await readWorkspaceSyncMeta('ws-1')).toBeNull();
  });
});
