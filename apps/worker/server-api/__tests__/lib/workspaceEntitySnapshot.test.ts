import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import {
  GLOBAL_DRAFT_ENTITY_ID,
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
  folders: [{ id: 'folder-1', name: 'Core', order: 1, createdAt: 5 }],
});

describe('workspaceEntitySnapshot', () => {
  it('round-trips every workspace entity type through stored rows', () => {
    const entities = workspaceSnapshotToEntities(snapshot());
    const storedRows = entities.map((entity) => ({
      entityType: entity.entityType,
      entityId: entity.entityId,
      payloadJson: JSON.stringify(entity.payload),
      updatedAt: entity.sourceUpdatedAt,
    }));

    expect(entities.map((entity) => entity.entityId)).toContain(GLOBAL_DRAFT_ENTITY_ID);
    expect(storedEntitiesToWorkspaceSnapshot(storedRows)).toEqual(snapshot());
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
      globalDraft: { state: { tableName: 'global' }, updatedAt: 10 },
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

  it('ignores deleted and incomplete persisted records', () => {
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
});
