export const WORKSPACE_SNAPSHOT_APPLIED_EVENT = 'ddlbuilder:workspace-snapshot-applied';

export const dispatchWorkspaceSnapshotApplied = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WORKSPACE_SNAPSHOT_APPLIED_EVENT));
  }
};
