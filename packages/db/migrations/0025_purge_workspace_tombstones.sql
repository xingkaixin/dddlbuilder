-- tombstone 只用于阻止默认 workspace 的一次性旧快照回填恢复已删除实体；回填完成或非默认 workspace 不再需要
DELETE FROM workspace_entities
WHERE deleted_at IS NOT NULL
  AND workspace_id IN (
    SELECT id
    FROM workspaces
    WHERE is_default = 0 OR legacy_snapshot_backfilled_at IS NOT NULL
  );
