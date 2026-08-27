import { createEntityId } from '@ddlbuilder/shared-types';
import type { SavedTableRecord } from './workspaceStorageTypes';

type SavedTableIdentitySource = Pick<SavedTableRecord, 'tableId' | 'normalizedName'>;

export const createSavedTableId = createEntityId;

export const resolveSavedTableId = ({ tableId, normalizedName }: SavedTableIdentitySource) =>
  tableId ?? `legacy:${normalizedName}`;
