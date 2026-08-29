import type { SchemaDocumentState } from '@ddlbuilder/shared-types';
import type { WorkspaceMigrationResponse } from '@ddlbuilder/shared-types/api';
import type { WorkspaceEntityType, WorkspaceSnapshot } from '@ddlbuilder/shared-types/workspace';
import { normalizeSchemaDocumentState, stableStringify } from '@ddlbuilder/workspace-core';
import { DomainError } from './http.js';
import {
  workspaceSnapshotToEntities,
  type WorkspaceEntityInput,
} from './workspaceEntitySnapshot.js';

type MigrationEntityRecord = {
  id: string;
  kind: WorkspaceEntityType;
  displayName: string;
  entity: WorkspaceEntityInput;
  payloadJson: string;
};

const LOCAL_COPY_SUFFIX = ' (Imported)';

const buildMigrationEntityId = (userId: string, kind: WorkspaceEntityType, entityId: string) =>
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

export const buildMigrationEntityRecords = (
  userId: string,
  snapshot: WorkspaceSnapshot,
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
    if (tableId === null) {
      throw new DomainError(
        400,
        'WORKSPACE_MIGRATION_INVALID',
        'Cannot migrate an ambiguous saved draft without a table ID',
      );
    }
    return { ...draft, tableId: tableId ?? `legacy:${draft.normalizedName}` };
  });
  const records = workspaceSnapshotToEntities({
    ...snapshot,
    savedTables,
    savedDrafts,
  }).map((entity) => toMigrationEntityRecord(userId, entity));
  orderFoldersByParent(records);
  return records;
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
  for (let counter = 0; counter <= reservedPayloads.size; counter += 1) {
    const displayName = buildLocalCopyName(baseName, counter);
    const normalizedName = normalizeName(displayName);
    const candidates = records.map((record) =>
      toMigrationEntityRecord(userId, buildCopyEntity(record, displayName, normalizedName)),
    );
    if (canReserveRecords(candidates, reservedPayloads)) return candidates;
  }
  throw new Error('Unable to reserve a migration copy name');
};

const orderFoldersByParent = (records: MigrationEntityRecord[]) => {
  const folders = records.filter((record) => record.kind === 'folder');
  const foldersById = new Map(folders.map((folder) => [folder.entity.entityId, folder]));
  const childIdsByParent = new Map<string, string[]>();
  const pendingParentCount = new Map(folders.map((folder) => [folder.entity.entityId, 0]));

  for (const folder of folders) {
    const folderId = folder.entity.entityId;
    const parentId = (folder.entity.payload as Record<string, unknown>).parentId;
    if (typeof parentId !== 'string' || !foldersById.has(parentId)) continue;
    pendingParentCount.set(folderId, 1);
    childIdsByParent.set(parentId, [...(childIdsByParent.get(parentId) ?? []), folderId]);
  }

  const ready = folders
    .map((folder) => folder.entity.entityId)
    .filter((folderId) => pendingParentCount.get(folderId) === 0);
  const ordered: MigrationEntityRecord[] = [];
  for (let index = 0; index < ready.length; index += 1) {
    const folderId = ready[index];
    const folder = foldersById.get(folderId);
    if (!folder) throw new Error(`Migration folder not found: ${folderId}`);
    ordered.push(folder);
    for (const childId of childIdsByParent.get(folderId) ?? []) ready.push(childId);
  }
  if (ordered.length !== folders.length) {
    throw new DomainError(
      400,
      'WORKSPACE_MIGRATION_INVALID',
      'Migration folders contain a parent cycle',
    );
  }
  return ordered;
};

const resolveMigrationRecords = (
  userId: string,
  sourceRecords: MigrationEntityRecord[],
  existingPayloads: ReadonlyMap<string, string>,
) => {
  const reservedPayloads = new Map(existingPayloads);
  const folderIds = new Map<string, string>();
  const resolvedRecords: MigrationEntityRecord[] = [];

  for (const source of orderFoldersByParent(sourceRecords)) {
    const referenced = replaceFolderReference(userId, source, folderIds);
    const records = canReserveRecords([referenced], reservedPayloads)
      ? [referenced]
      : copyRecordGroup(userId, [referenced], reservedPayloads);
    const resolved = records[0];
    folderIds.set(source.entity.entityId, resolved.entity.entityId);
    reserveRecords(records, reservedPayloads);
    resolvedRecords.push(resolved);
  }

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

export const analyzeMigrationRecords = (
  sourceRecords: MigrationEntityRecord[],
  existingRecords: MigrationEntityRecord[],
) => {
  let createdCount = 0;
  let skippedCount = 0;
  const conflicts: WorkspaceMigrationResponse['conflicts'] = [];
  const existingPayloads = buildEntityPayloadMap(existingRecords);

  for (const record of sourceRecords) {
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
      kind: record.kind,
      normalizedName: typeof normalizedName === 'string' ? normalizedName : record.entity.entityId,
      displayName: record.displayName,
    });
  }

  return { createdCount, skippedCount, conflicts };
};

export const buildMigrationWritePlan = (
  userId: string,
  sourceRecords: MigrationEntityRecord[],
  existingRecords: MigrationEntityRecord[],
) => {
  const existingPayloads = buildEntityPayloadMap(existingRecords);
  const sourceIds = new Set(sourceRecords.map((record) => record.id));
  const entities: WorkspaceEntityInput[] = [];
  let createdCount = 0;
  let copiedCount = 0;
  let skippedCount = 0;

  for (const record of resolveMigrationRecords(userId, sourceRecords, existingPayloads)) {
    if (existingPayloads.get(record.id) === record.payloadJson) {
      skippedCount += 1;
      continue;
    }
    entities.push(record.entity);
    if (sourceIds.has(record.id)) createdCount += 1;
    else copiedCount += 1;
  }

  return { entities, createdCount, copiedCount, skippedCount };
};
