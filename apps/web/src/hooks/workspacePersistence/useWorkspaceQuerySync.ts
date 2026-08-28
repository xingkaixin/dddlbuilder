import { useEffect } from 'react';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import { useWorkspaceAuthority } from './useWorkspaceAuthority';

export function useWorkspaceQuerySync() {
  const { refresh, storage } = useWorkspaceAuthority();
  useEffect(() => {
    if (storage.kind !== 'indexeddb') return;
    const handleSnapshotApplied = () => void refresh();
    window.addEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    return () =>
      window.removeEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
  }, [refresh, storage.kind]);
}
