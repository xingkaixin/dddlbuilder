export type WorkspaceD1Metrics = {
  queries: number;
  rowsRead: number;
  rowsWritten: number;
  durationMs: number;
};

type D1ResultLike = {
  meta?: Partial<D1Meta>;
};

export const createWorkspaceD1Metrics = (): WorkspaceD1Metrics => ({
  queries: 0,
  rowsRead: 0,
  rowsWritten: 0,
  durationMs: 0,
});

const readNumber = (value: number | undefined): number =>
  Number.isFinite(value) ? (value ?? 0) : 0;

export const recordWorkspaceD1Result = (
  metrics: WorkspaceD1Metrics | undefined,
  result: D1ResultLike | null | undefined,
) => {
  if (!metrics) return;
  const target = metrics;

  target.queries += 1;
  const meta = result?.meta;

  if (!meta) return;
  const { rows_read: rowsRead, rows_written: rowsWritten, duration } = meta;

  target.rowsRead += readNumber(rowsRead);
  target.rowsWritten += readNumber(rowsWritten);
  target.durationMs += readNumber(duration);
};

export const allWorkspaceD1Result = async <T>(
  statement: D1PreparedStatement,
  metrics?: WorkspaceD1Metrics,
) => {
  const result = await statement.all<T>();
  recordWorkspaceD1Result(metrics, result);

  return result;
};

export const firstWorkspaceD1Result = async <T>(
  statement: D1PreparedStatement,
  metrics?: WorkspaceD1Metrics,
) => {
  if (!metrics) {
    return statement.first<T>();
  }

  const result = await allWorkspaceD1Result<T>(statement, metrics);

  return result.results?.[0] ?? null;
};

export const runWorkspaceD1Result = async <T>(
  statement: D1PreparedStatement,
  metrics?: WorkspaceD1Metrics,
) => {
  const result = await statement.run<T>();
  recordWorkspaceD1Result(metrics, result);

  return result;
};

export const batchWorkspaceD1Results = async <T>(
  database: D1Database,
  statements: D1PreparedStatement[],
  metrics?: WorkspaceD1Metrics,
) => {
  const results = await database.batch<T>(statements);

  for (const result of results) {
    recordWorkspaceD1Result(metrics, result);
  }

  return results;
};

export const logWorkspaceD1Metrics = (
  operation: string,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- metrics logging accepts arbitrary structured context fields.
  payload: Record<string, unknown>,
  metrics: WorkspaceD1Metrics,
) => {
  if (metrics.queries === 0) return;
  console.info(
    JSON.stringify({
      event: 'workspace_sync_d1',
      operation,
      ...payload,
      d1: metrics,
    }),
  );
};

export const logWorkspaceYDocHealth = (
  operation: string,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- health logging accepts arbitrary structured context fields.
  payload: Record<string, unknown>,
) => {
  console.info(
    JSON.stringify({
      event: 'workspace_yjs_do_health',
      operation,
      ...payload,
    }),
  );
};
