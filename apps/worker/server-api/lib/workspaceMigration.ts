import type { SchemaDocumentState } from '@ddlbuilder/shared-types';
import type * as Y from 'yjs';
import {
  exportWorkspaceYDocToSnapshot,
  mergeWorkspaceSnapshotIntoYDoc,
  normalizeSchemaDocumentState,
  stableStringify,
} from '@ddlbuilder/workspace-core';
import type { WorkspaceMigrationResponse } from '@ddlbuilder/shared-types/api';
import type {
  WorkspaceEntityType,
  WorkspaceMigrationPayload,
  WorkspaceMigrationSnapshot,
  WorkspaceSnapshot,
} from '@ddlbuilder/shared-types/workspace';
import type { ApiEnv } from './context.js';
import { openDefaultWorkspaceYDocAuthority } from './workspaceYDocAuthority.js';
import {
  storedEntitiesToWorkspaceSnapshot,
  workspaceSnapshotToEntities,
  type WorkspaceEntityInput,
} from './workspaceEntitySnapshot.js';

type MigrationEntityKind = WorkspaceEntityType;
type ConflictKind = 'draft' | 'saved_table' | 'saved_draft' | 'folder';

type MigrationEntityRecord = {
  id: string;
  kind: MigrationEntityKind;
  displayName: string;
  entity: WorkspaceEntityInput;
  payloadJson: string;
};

export type WorkspaceMigrationResult = Omit<WorkspaceMigrationResponse, 'meta'>;

const LOCAL_COPY_SUFFIX = ' (Imported)';

const buildMigrationEntityId = (userId: string, kind: MigrationEntityKind, entityId: string) =>
  `${kind}:${userId}:${entityId}`;

const toMigrationEntityRecord = (
  userId: string,
  entity: WorkspaceEntityInput,
): MigrationEntityRecord => {
  const kind = entity.entityType;
  const sourcePayload = entity.payload as Record<string, unknown>;
  const payload: Record<string, unknown> = {
    ...sourcePayload,
    ...(kind !== 'folder'
      ? { state: normalizeSchemaDocumentState(sourcePayload.state as SchemaDocumentState) }
      : {}),
    ...(kind !== 'saved_draft'
      ? { createdAt: sourcePayload.createdAt ?? entity.sourceUpdatedAt }
      : {}),
  };
  const payloadName = typeof payload.name === 'string' ? payload.name : entity.entityId;
  const payloadTableName =
    typeof payload.tableName === 'string' ? payload.tableName : entity.entityId;
  const displayName =
    kind === 'saved_table' || kind === 'folder'
      ? payloadName
      : kind === 'saved_draft'
        ? payloadTableName
        : entity.entityId;

  return {
    id: buildMigrationEntityId(userId, kind, entity.entityId),
    kind,
    displayName,
    entity: { ...entity, payload },
    payloadJson: stableStringify(payload),
  };
};

const toConflictKind = (kind: MigrationEntityKind): ConflictKind => kind;

const normalizeName = (value: string) => value.trim().toLowerCase();

const buildLocalCopyName = (baseName: string, counter: number) =>
  counter === 0
    ? `${baseName}${LOCAL_COPY_SUFFIX}`
    : `${baseName}${LOCAL_COPY_SUFFIX} ${counter + 1}`;

const buildCopyEntity = (
  source: MigrationEntityRecord,
  displayName: string,
  normalizedName: string,
): WorkspaceEntityInput => {
  const sourcePayload = source.entity.payload as Record<string, unknown>;

  switch (source.kind) {
    case 'saved_table':
    case 'saved_draft': {
      const tableId = source.entity.entityId.startsWith('legacy:')
        ? `legacy:${normalizedName}`
        : `import:${source.entity.entityId}:${normalizedName}`;
      return {
        ...source.entity,
        entityId: tableId,
        payload: {
          ...sourcePayload,
          tableId,
          normalizedName,
          [source.kind === 'saved_table' ? 'name' : 'tableName']: displayName,
        },
      };
    }
    case 'folder':
      return {
        ...source.entity,
        entityId: normalizedName,
        payload: { ...sourcePayload, name: displayName },
      };
    case 'draft':
      return {
        ...source.entity,
        entityId: normalizedName,
      };
  }
};

const readWorkspaceLink = async (
  env: ApiEnv['Bindings'],
  userId: string,
  localFingerprint: string,
) => {
  return env.USER_DB.prepare(
    `
      SELECT migration_status AS migrationStatus
      FROM workspace_links
      WHERE user_id = ? AND local_fingerprint = ?
      LIMIT 1
    `,
  )
    .bind(userId, localFingerprint)
    .first<{ migrationStatus: string }>();
};

const upsertWorkspaceLink = async (
  env: ApiEnv['Bindings'],
  input: {
    userId: string;
    localFingerprint: string;
    migrationStatus: 'pending' | 'completed' | 'failed';
    idempotencyKey: string;
  },
) => {
  await env.USER_DB.prepare(
    `
      INSERT INTO workspace_links (
        id,
        user_id,
        local_fingerprint,
        migration_status,
        last_idempotency_key,
        migrated_at
      )
      VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END)
      ON CONFLICT(user_id, local_fingerprint) DO UPDATE SET
        migration_status = excluded.migration_status,
        last_idempotency_key = excluded.last_idempotency_key,
        migrated_at = CASE
          WHEN excluded.migration_status = 'completed' THEN CURRENT_TIMESTAMP
          ELSE workspace_links.migrated_at
        END
    `,
  )
    .bind(
      `workspace-link:${input.userId}:${input.localFingerprint}`,
      input.userId,
      input.localFingerprint,
      input.migrationStatus,
      input.idempotencyKey,
      input.migrationStatus,
    )
    .run();
};

const mergeGlobalDraft = (
  snapshot: WorkspaceSnapshot,
  activeSession?: WorkspaceMigrationPayload['snapshot']['activeSession'],
) => {
  const sessionDraft =
    activeSession?.activeSource.kind === 'draft' && activeSession.activeState
      ? {
          state: activeSession.activeState,
          updatedAt: activeSession.updatedAt,
        }
      : null;

  if (!snapshot.globalDraft) return sessionDraft;
  if (!sessionDraft) return snapshot.globalDraft;
  return snapshot.globalDraft.updatedAt >= sessionDraft.updatedAt
    ? snapshot.globalDraft
    : sessionDraft;
};

const buildMigrationEntityRecords = (
  userId: string,
  snapshot: WorkspaceSnapshot,
  activeSession?: WorkspaceMigrationPayload['snapshot']['activeSession'],
): MigrationEntityRecord[] => {
  const savedTables = snapshot.savedTables.map((table) => ({
    ...table,
    tableId: table.tableId ?? `legacy:${table.normalizedName}`,
  }));
  const tableIdsByName = new Map<string, string | null>();
  for (const table of savedTables) {
    const existing = tableIdsByName.get(table.normalizedName);
    tableIdsByName.set(
      table.normalizedName,
      existing === undefined || existing === table.tableId ? table.tableId : null,
    );
  }
  const savedDrafts = snapshot.savedDrafts.map((draft) => {
    const tableId = draft.tableId ?? tableIdsByName.get(draft.normalizedName);
    if (tableId === null)
      throw new Error('Cannot migrate an ambiguous saved draft without a table ID');
    return { ...draft, tableId: tableId ?? `legacy:${draft.normalizedName}` };
  });
  return workspaceSnapshotToEntities({
    ...snapshot,
    savedTables,
    savedDrafts,
    globalDraft: mergeGlobalDraft(snapshot, activeSession),
  }).map((entity) => toMigrationEntityRecord(userId, entity));
};

const buildEntityPayloadMap = (records: MigrationEntityRecord[]) =>
  new Map(records.map((record) => [record.id, record.payloadJson] as const));

const replaceFolderReference = (
  userId: string,
  record: MigrationEntityRecord,
  folderIds: ReadonlyMap<string, string>,
) => {
  const payload = record.entity.payload as Record<string, unknown>;
  const referenceName = record.kind === 'folder' ? 'parentId' : 'folderId';
  const sourceFolderId = payload[referenceName];
  if (typeof sourceFolderId !== 'string') return record;
  const targetFolderId = folderIds.get(sourceFolderId);
  if (!targetFolderId || targetFolderId === sourceFolderId) return record;
  return toMigrationEntityRecord(userId, {
    ...record.entity,
    payload: { ...payload, [referenceName]: targetFolderId },
  });
};

const canReserveRecords = (
  records: MigrationEntityRecord[],
  reservedPayloads: ReadonlyMap<string, string>,
) =>
  records.every((record) => {
    const payload = reservedPayloads.get(record.id);
    return payload === undefined || payload === record.payloadJson;
  });

const reserveRecords = (
  records: MigrationEntityRecord[],
  reservedPayloads: Map<string, string>,
) => {
  for (const record of records) reservedPayloads.set(record.id, record.payloadJson);
};

const copyRecordGroup = (
  userId: string,
  records: MigrationEntityRecord[],
  reservedPayloads: ReadonlyMap<string, string>,
) => {
  const baseName =
    records.find((record) => record.kind === 'saved_table')?.displayName ?? records[0].displayName;
  let counter = 0;
  while (true) {
    const displayName = buildLocalCopyName(baseName, counter);
    const normalizedName = normalizeName(displayName);
    const candidates = records.map((record) =>
      toMigrationEntityRecord(userId, buildCopyEntity(record, displayName, normalizedName)),
    );
    if (canReserveRecords(candidates, reservedPayloads)) return candidates;
    counter += 1;
  }
};

const resolveMigrationRecords = (
  userId: string,
  sourceRecords: MigrationEntityRecord[],
  existingPayloads: ReadonlyMap<string, string>,
) => {
  const reservedPayloads = new Map(existingPayloads);
  const folderIds = new Map<string, string>();
  const sourceFolders = new Map(
    sourceRecords
      .filter((record) => record.kind === 'folder')
      .map((record) => [record.entity.entityId, record] as const),
  );
  const resolvedRecords: MigrationEntityRecord[] = [];
  const resolvedFolders = new Map<string, MigrationEntityRecord>();
  const resolvingFolders = new Set<string>();

  const resolveFolder = (folderId: string): MigrationEntityRecord => {
    const existingResolution = resolvedFolders.get(folderId);
    if (existingResolution) return existingResolution;

    const source = sourceFolders.get(folderId);
    if (!source) throw new Error(`Migration folder not found: ${folderId}`);
    const parentId = (source.entity.payload as Record<string, unknown>).parentId;
    if (
      typeof parentId === 'string' &&
      sourceFolders.has(parentId) &&
      !resolvingFolders.has(parentId)
    ) {
      resolvingFolders.add(folderId);
      resolveFolder(parentId);
      resolvingFolders.delete(folderId);
    }

    const referenced = replaceFolderReference(userId, source, folderIds);
    const records = canReserveRecords([referenced], reservedPayloads)
      ? [referenced]
      : copyRecordGroup(userId, [referenced], reservedPayloads);
    const resolved = records[0];
    folderIds.set(folderId, resolved.entity.entityId);
    resolvedFolders.set(folderId, resolved);
    reserveRecords(records, reservedPayloads);
    resolvedRecords.push(resolved);
    return resolved;
  };

  for (const folderId of sourceFolders.keys()) resolveFolder(folderId);

  const tableGroups = new Map<string, MigrationEntityRecord[]>();
  for (const record of sourceRecords) {
    if (record.kind !== 'saved_table' && record.kind !== 'saved_draft') continue;
    const group = tableGroups.get(record.entity.entityId) ?? [];
    group.push(replaceFolderReference(userId, record, folderIds));
    tableGroups.set(record.entity.entityId, group);
  }
  for (const group of tableGroups.values()) {
    const records = canReserveRecords(group, reservedPayloads)
      ? group
      : copyRecordGroup(userId, group, reservedPayloads);
    reserveRecords(records, reservedPayloads);
    resolvedRecords.push(...records);
  }

  for (const source of sourceRecords.filter((record) => record.kind === 'draft')) {
    const referenced = replaceFolderReference(userId, source, folderIds);
    const records = canReserveRecords([referenced], reservedPayloads)
      ? [referenced]
      : copyRecordGroup(userId, [referenced], reservedPayloads);
    reserveRecords(records, reservedPayloads);
    resolvedRecords.push(...records);
  }

  return resolvedRecords;
};

export const analyzeWorkspaceMigration = async (
  env: ApiEnv['Bindings'],
  userId: string,
  payload: WorkspaceMigrationPayload,
): Promise<WorkspaceMigrationResult> => {
  const records = buildMigrationEntityRecords(
    userId,
    payload.snapshot,
    payload.snapshot.activeSession,
  );
  if (records.length === 0) {
    return {
      status: 'no_data',
      createdCount: 0,
      copiedCount: 0,
      skippedCount: 0,
      conflictCount: 0,
      conflicts: [],
    };
  }

  const existingLink = await readWorkspaceLink(env, userId, payload.localFingerprint);
  if (existingLink?.migrationStatus === 'completed') {
    return {
      status: 'completed',
      createdCount: 0,
      copiedCount: 0,
      skippedCount: records.length,
      conflictCount: 0,
      conflicts: [],
    };
  }

  let createdCount = 0;
  let skippedCount = 0;
  const conflicts: WorkspaceMigrationResult['conflicts'] = [];
  const authority = await openDefaultWorkspaceYDocAuthority(env, userId);
  const existingPayloads = buildEntityPayloadMap(
    buildMigrationEntityRecords(userId, await authority.readSnapshot()),
  );

  for (const record of records) {
    const existingPayload = existingPayloads.get(record.id);
    if (existingPayload === undefined) {
      createdCount += 1;
      continue;
    }

    if (existingPayload === record.payloadJson) {
      skippedCount += 1;
      continue;
    }

    const normalizedName = (record.entity.payload as Record<string, unknown>).normalizedName;
    conflicts.push({
      kind: toConflictKind(record.kind),
      normalizedName: typeof normalizedName === 'string' ? normalizedName : record.entity.entityId,
      displayName: record.displayName,
    });
  }

  return {
    status: 'ready',
    createdCount,
    copiedCount: 0,
    skippedCount,
    conflictCount: conflicts.length,
    conflicts,
  };
};

export const applyWorkspaceMigrationSnapshot = (
  doc: Y.Doc,
  userId: string,
  snapshot: WorkspaceMigrationSnapshot,
): WorkspaceMigrationResult => {
  const records = buildMigrationEntityRecords(userId, snapshot, snapshot.activeSession);
  const existingPayloads = buildEntityPayloadMap(
    buildMigrationEntityRecords(userId, exportWorkspaceYDocToSnapshot(doc)),
  );
  const sourceIds = new Set(records.map((record) => record.id));
  const entitiesToWrite: WorkspaceEntityInput[] = [];
  let createdCount = 0;
  let copiedCount = 0;
  let skippedCount = 0;
  for (const record of resolveMigrationRecords(userId, records, existingPayloads)) {
    if (existingPayloads.get(record.id) === record.payloadJson) {
      skippedCount += 1;
      continue;
    }
    entitiesToWrite.push(record.entity);
    if (sourceIds.has(record.id)) createdCount += 1;
    else copiedCount += 1;
  }
  if (entitiesToWrite.length > 0) {
    mergeWorkspaceSnapshotIntoYDoc(
      doc,
      storedEntitiesToWorkspaceSnapshot(
        entitiesToWrite.map((entity) => ({
          entityType: entity.entityType,
          entityId: entity.entityId,
          payloadJson: JSON.stringify(entity.payload),
          updatedAt: entity.sourceUpdatedAt,
        })),
      ),
    );
  }
  return {
    status: records.length === 0 ? 'no_data' : 'completed',
    createdCount,
    copiedCount,
    skippedCount,
    conflictCount: 0,
    conflicts: [],
  };
};

export const commitWorkspaceMigration = async (
  env: ApiEnv['Bindings'],
  userId: string,
  payload: WorkspaceMigrationPayload,
): Promise<WorkspaceMigrationResult> => {
  const records = buildMigrationEntityRecords(
    userId,
    payload.snapshot,
    payload.snapshot.activeSession,
  );
  if (records.length === 0) {
    return {
      status: 'no_data',
      createdCount: 0,
      copiedCount: 0,
      skippedCount: 0,
      conflictCount: 0,
      conflicts: [],
    };
  }

  const existingLink = await readWorkspaceLink(env, userId, payload.localFingerprint);
  if (existingLink?.migrationStatus === 'completed') {
    return {
      status: 'completed',
      createdCount: 0,
      copiedCount: 0,
      skippedCount: records.length,
      conflictCount: 0,
      conflicts: [],
    };
  }

  await upsertWorkspaceLink(env, {
    userId,
    localFingerprint: payload.localFingerprint,
    migrationStatus: 'pending',
    idempotencyKey: payload.idempotencyKey,
  });

  try {
    const authority = await openDefaultWorkspaceYDocAuthority(env, userId);
    const result = await authority.migrateSnapshot(payload.snapshot);

    await upsertWorkspaceLink(env, {
      userId,
      localFingerprint: payload.localFingerprint,
      migrationStatus: 'completed',
      idempotencyKey: payload.idempotencyKey,
    });

    return result;
  } catch (error) {
    await upsertWorkspaceLink(env, {
      userId,
      localFingerprint: payload.localFingerprint,
      migrationStatus: 'failed',
      idempotencyKey: payload.idempotencyKey,
    });
    throw error;
  }
};
