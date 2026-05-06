import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceD1Metrics,
  firstWorkspaceD1Result,
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

  it('records first queries through D1 result meta', async () => {
    const metrics = createWorkspaceD1Metrics();
    const statement = {
      first: vi.fn(),
      all: vi.fn().mockResolvedValue({
        results: [{ id: 'ws-1' }],
        meta: {
          rows_read: 1,
          rows_written: 0,
          duration: 2,
        },
      }),
    } as unknown as D1PreparedStatement;

    const row = await firstWorkspaceD1Result<{ id: string }>(statement, metrics);

    expect(row).toEqual({ id: 'ws-1' });
    expect(statement.all).toHaveBeenCalledTimes(1);
    expect(statement.first).toHaveBeenCalledTimes(0);
    expect(metrics).toEqual({
      queries: 1,
      rowsRead: 1,
      rowsWritten: 0,
      durationMs: 2,
    });
  });

  it('counts D1 queries even when a result has no meta', () => {
    const metrics = createWorkspaceD1Metrics();

    recordWorkspaceD1Result(metrics, {});

    expect(metrics).toMatchObject({
      queries: 1,
      rowsRead: 0,
      rowsWritten: 0,
      durationMs: 0,
    });
  });
});
