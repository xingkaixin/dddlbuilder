import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceD1Metrics,
  logWorkspaceD1Metrics,
  recordWorkspaceD1Result,
} from '../../lib/workspaceSyncMetrics.js';

describe('workspaceSyncMetrics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs aggregated D1 rows from query meta', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const metrics = createWorkspaceD1Metrics();

    recordWorkspaceD1Result(metrics, {
      meta: {
        rows_read: 12,
        rows_written: 3,
        duration: 1.5,
      },
    });
    recordWorkspaceD1Result(metrics, {
      meta: {
        rows_read: 7,
        rows_written: 2,
        duration: 0.5,
      },
    });
    logWorkspaceD1Metrics('checkpoint', { workspaceId: 'ws-1' }, metrics);

    const payload = JSON.parse(String(info.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(payload).toMatchObject({
      event: 'workspace_sync_d1',
      operation: 'checkpoint',
      workspaceId: 'ws-1',
      d1: {
        queries: 2,
        rowsRead: 19,
        rowsWritten: 5,
        durationMs: 2,
      },
    });
  });
});
