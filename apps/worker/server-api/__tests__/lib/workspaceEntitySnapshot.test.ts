import { afterEach, describe, expect, it, vi } from 'vitest';
import { type PersistedState, toSchemaDocumentState } from '@ddlbuilder/shared-types';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import {
  LEGACY_GLOBAL_DRAFT_ENTITY_ID,
  legacyRowsToWorkspaceSnapshot,
  storedEntitiesToWorkspaceSnapshot,
  workspaceSnapshotToEntities,
} from '../../lib/workspaceEntitySnapshot.js';

const state = (tableName: string): PersistedState => ({
  schemaName: 'public',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 12,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

const snapshot = (): WorkspaceSnapshot => ({
  globalDraft: { state: state('global'), updatedAt: 10 },
  drafts: [
    {
      draftId: 'draft-1',
      state: state('draft'),
      createdAt: 20,
      updatedAt: 21,
      folderId: 'folder-1',
      trashedAt: 22,
    },
  ],
  savedTables: [
    {
      normalizedName: 'users',
      name: 'Users',
      state: state('users'),
      createdAt: 30,
      updatedAt: 31,
      folderId: 'folder-1',
      trashedAt: 32,
    },
  ],
  savedDrafts: [
    {
      normalizedName: 'users',
      tableName: 'Users',
      state: state('users_draft'),
      updatedAt: 40,
      baseSignature: 'base',
    },
  ],
  folders: [{ id: 'folder-1', name: 'Core', order: 1, createdAt: 5, updatedAt: 5 }],
});

describe('workspaceEntitySnapshot', () => {
  afterEach(() => vi.restoreAllMocks());

  it('round-trips every workspace entity type through stored rows', () => {
    const entities = workspaceSnapshotToEntities(snapshot());
    const storedRows = entities.map((entity) => ({
      entityType: entity.entityType,
      entityId: entity.entityId,
      payloadJson: JSON.stringify(entity.payload),
      updatedAt: entity.sourceUpdatedAt,
    }));

    expect(entities.map((entity) => entity.entityId)).not.toContain(LEGACY_GLOBAL_DRAFT_ENTITY_ID);
    expect(entities.map((entity) => entity.entityId)).toContain('default');
    const expected = snapshot();
    expected.drafts = expected.drafts.map((draft) => ({
      ...draft,
      state: toSchemaDocumentState(draft.state),
    }));
    expected.savedTables = expected.savedTables.map((table) => ({
      ...table,
      state: toSchemaDocumentState(table.state),
    }));
    expected.savedDrafts = expected.savedDrafts.map((draft) => ({
      ...draft,
      state: toSchemaDocumentState(draft.state),
    }));
    expect(storedEntitiesToWorkspaceSnapshot(storedRows)).toEqual({
      ...expected,
      globalDraft: null,
      drafts: [
        {
          draftId: 'default',
          state: toSchemaDocumentState(state('global')),
          createdAt: 10,
          updatedAt: 10,
        },
        ...expected.drafts,
      ],
    });
  });

  it('keeps same-name tables and drafts distinct across storage round trips', () => {
    const source = snapshot();
    source.savedTables = ['table-1', 'table-2'].map((tableId) => ({
      ...source.savedTables[0],
      tableId,
    }));
    source.savedDrafts = ['table-1', 'table-2'].map((tableId) => ({
      ...source.savedDrafts[0],
      tableId,
    }));
    const entities = workspaceSnapshotToEntities(source);
    const restored = storedEntitiesToWorkspaceSnapshot(
      entities.map((entity) => ({
        entityType: entity.entityType,
        entityId: entity.entityId,
        payloadJson: JSON.stringify(entity.payload),
        updatedAt: entity.sourceUpdatedAt,
      })),
    );
    expect(
      entities
        .filter((entity) => entity.entityType === 'saved_table')
        .map((entity) => entity.entityId),
    ).toEqual(['table-1', 'table-2']);
    expect(
      restored.savedTables.map(({ tableId, normalizedName }) => ({ tableId, normalizedName })),
    ).toEqual(
      source.savedTables.map(({ tableId, normalizedName }) => ({ tableId, normalizedName })),
    );
    expect(restored.savedDrafts.map((draft) => draft.tableId)).toEqual(['table-1', 'table-2']);
  });

  it('normalizes legacy rows through the same entity mapping policy', () => {
    const legacySnapshot = legacyRowsToWorkspaceSnapshot([
      {
        kind: 'global_draft',
        normalizedName: null,
        payloadJson: JSON.stringify({ state: state('global') }),
        sourceUpdatedAt: 10,
      },
      {
        kind: 'saved_table',
        normalizedName: 'users',
        payloadJson: JSON.stringify({
          name: 'Users',
          state: state('users'),
          folderId: 'folder-1',
        }),
        sourceUpdatedAt: 31,
      },
      {
        kind: 'folder',
        normalizedName: 'folder-1',
        payloadJson: JSON.stringify({
          id: 'folder-1',
          name: 'Core',
          parentId: 'root',
        }),
        sourceUpdatedAt: 5,
      },
    ]);

    expect(legacySnapshot).toMatchObject({
      globalDraft: null,
      drafts: [{ draftId: 'default', state: { tableName: 'global' }, updatedAt: 10 }],
      savedTables: [
        {
          normalizedName: 'users',
          createdAt: 31,
          folderId: 'folder-1',
        },
      ],
      folders: [
        {
          id: 'folder-1',
          parentId: 'root',
          order: 0,
          createdAt: 5,
        },
      ],
    });
  });

  it('keeps the newest default draft across legacy and canonical entity ids', () => {
    const result = storedEntitiesToWorkspaceSnapshot([
      {
        entityType: 'draft',
        entityId: LEGACY_GLOBAL_DRAFT_ENTITY_ID,
        payloadJson: JSON.stringify({ state: state('stale') }),
        updatedAt: 1,
      },
      {
        entityType: 'draft',
        entityId: 'default',
        payloadJson: JSON.stringify({ state: state('current') }),
        updatedAt: 2,
      },
    ]);

    expect(result.globalDraft).toBeNull();
    expect(result.drafts).toEqual([
      expect.objectContaining({
        draftId: 'default',
        state: expect.objectContaining({ tableName: 'current' }),
      }),
    ]);
  });

  it('ignores deleted and incomplete persisted records', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(
      storedEntitiesToWorkspaceSnapshot([
        {
          entityType: 'draft',
          entityId: 'deleted',
          payloadJson: null,
          updatedAt: 1,
        },
        {
          entityType: 'saved_table',
          entityId: 'invalid',
          payloadJson: JSON.stringify({ state: state('invalid') }),
          updatedAt: 2,
        },
      ]),
    ).toEqual({
      globalDraft: null,
      drafts: [],
      savedTables: [],
      savedDrafts: [],
      folders: [],
    });

    expect(
      legacyRowsToWorkspaceSnapshot([
        {
          kind: 'draft',
          normalizedName: null,
          payloadJson: JSON.stringify({ state: state('invalid') }),
          sourceUpdatedAt: 1,
        },
      ]),
    ).toEqual({
      globalDraft: null,
      drafts: [],
      savedTables: [],
      savedDrafts: [],
      folders: [],
    });
  });

  it('skips malformed rows without discarding valid workspace entities', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = storedEntitiesToWorkspaceSnapshot([
      {
        entityType: 'draft',
        entityId: 'malformed-json',
        payloadJson: '{invalid',
        updatedAt: 1,
      },
      {
        entityType: 'draft',
        entityId: 'invalid-state',
        payloadJson: JSON.stringify({ state: { tableName: 1 } }),
        updatedAt: 2,
      },
      {
        entityType: 'draft',
        entityId: 'valid',
        payloadJson: JSON.stringify({ state: state('valid') }),
        updatedAt: 3,
      },
    ]);

    expect(result.drafts).toEqual([
      expect.objectContaining({
        draftId: 'valid',
        state: expect.objectContaining({ tableName: 'valid' }),
      }),
    ]);
    expect(warn).toHaveBeenCalledWith('workspace_entity_decode_failed', {
      entityType: 'draft',
      entityId: 'malformed-json',
      reason: 'invalid_json',
    });
    expect(warn).toHaveBeenCalledWith('workspace_entity_decode_failed', {
      entityType: 'draft',
      entityId: 'invalid-state',
      reason: 'invalid_payload',
    });
  });
});
