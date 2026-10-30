import { queryOptions } from '@tanstack/react-query';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';

export const erDiagramTablesOptions = (loadTables: () => Promise<SavedTableRecord[]>) =>
  queryOptions({
    queryKey: ['er-diagram', 'tables'],
    queryFn: loadTables,
    // Every open reads a fresh snapshot and refreshes only on demand, so nothing is cached between opens.
    gcTime: 0,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    // The loader reads the local Y.Doc or IndexedDB and must not pause while offline.
    networkMode: 'always',
  });
