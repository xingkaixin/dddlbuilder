import type { ReactNode } from 'react';
import type { ParsedResult } from '@/utils/SqlParser';
import type { DatabaseType, PersistedState } from '@ddlbuilder/shared-types';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SavedTableSummary, SaveTableResult } from '@/hooks/useSavedTables';

export type ConflictStrategy = 'skip' | 'overwrite' | 'rename';

export type BatchImportStep = 'input' | 'select' | 'save';

export interface BatchImportSqlDialogProps {
  currentDbType: DatabaseType;
  savedTables: SavedTableSummary[];
  folders: FolderTreeNode[];
  folderTree: FolderTreeNode[];
  saveTable: (name: string, state: PersistedState) => Promise<SaveTableResult>;
  overwriteTable: (normalizedName: string, state: PersistedState) => Promise<SaveTableResult>;
  moveTableToFolder: (normalizedName: string, folderId?: string) => Promise<SaveTableResult>;
  onImportComplete: () => void;
  triggerClassName?: string;
  triggerIcon?: ReactNode;
  triggerLabel?: string;
}

export type ParsedTableItem = ParsedResult & {
  selected: boolean;
  conflict: boolean;
};

export interface FailedItem {
  statement: string;
  error: string;
}
