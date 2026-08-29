import type { Context } from 'hono';
import { matchedRoutes } from 'hono/route';
import { initWorkersLogger, withEvlog, type EvlogWorkersOptions } from 'evlog/workers';
import type { ApiEnv, WorkerRequestLogger } from './context.js';

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;
const API_PATH_PREFIX = '/api';

const isVitest = () => {
  const runtimeProcess = Reflect.get(globalThis, 'process') as
    | { env?: Record<string, string | undefined> }
    | undefined;
  return runtimeProcess?.env?.VITEST === 'true';
};

export const configureWorkerLogging = (enabled = !isVitest()) => {
  initWorkersLogger({
    enabled,
    env: {
      service: 'ddlbuilder-worker',
      environment: 'production',
    },
    redact: {
      paths: [
        '**.authorization',
        '**.cookie',
        '**.setCookie',
        '**.password',
        '**.passwordHash',
        '**.token',
        '**.*Token',
        '**.apiKey',
        '**.secret',
        '**.sql',
        '**.ddl',
        '**.prompt',
        '**.messages',
        '**.requestBody',
        '**.responseBody',
        '**.state',
        '**.snapshot',
        '**.yjsUpdate',
      ],
    },
  });
};

configureWorkerLogging();

export const WORKER_LOGGING_OPTIONS = {
  include: ['/api/**'],
  exclude: ['/api/health'],
} satisfies EvlogWorkersOptions;

export const normalizeIncomingRequestId = (value: string | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  return REQUEST_ID_PATTERN.test(trimmed) ? trimmed : null;
};

const isApiPath = (pathname: string) =>
  pathname === API_PATH_PREFIX || pathname.startsWith(`${API_PATH_PREFIX}/`);

export const normalizeApiRequestId = (request: Request) => {
  if (!isApiPath(new URL(request.url).pathname)) return request;

  const headers = new Headers(request.headers);
  const requestId = normalizeIncomingRequestId(headers.get('x-request-id') ?? undefined);
  headers.set('x-request-id', requestId ?? crypto.randomUUID());
  return new Request(request, { headers });
};

type WorkerFetch = (
  request: Request,
  env: ApiEnv['Bindings'],
  ctx?: ExecutionContext,
) => Response | Promise<Response>;

export const withWorkerRequestLogging = (handler: WorkerFetch): WorkerFetch => {
  const loggedWorker = withEvlog<ApiEnv['Bindings']>(async (request, env, ctx, log) => {
    const response = await handler(
      request,
      {
        ...env,
        EVLOG_REQUEST_LOG: log as WorkerRequestLogger,
      },
      ctx as ExecutionContext,
    );
    if (response.status >= 500) log.setLevel('error');
    else if (response.status >= 400) log.setLevel('warn');
    return response;
  }, WORKER_LOGGING_OPTIONS);

  return (request, env, ctx) =>
    loggedWorker.fetch(normalizeApiRequestId(request), env, ctx as ExecutionContext);
};

export const getRequestLogger = (c: Context<ApiEnv>): WorkerRequestLogger | undefined =>
  c.get('log');

const getCanonicalRequestPath = (c: Context<ApiEnv>) => {
  const routes = matchedRoutes(c);
  for (let index = routes.length - 1; index >= 0; index -= 1) {
    const route = routes[index];
    if (!route || route.path === '*' || route.path === '/*') continue;
    return route.path.startsWith(API_PATH_PREFIX) ? route.path : `${API_PATH_PREFIX}${route.path}`;
  }
  return '/api/*';
};

export const completeRequestLogContext = (c: Context<ApiEnv>, requestId: string) => {
  const log = getRequestLogger(c);
  if (!log) return;

  const currentUserId = c.get('currentUserId');
  log.set({
    path: getCanonicalRequestPath(c),
    requestId,
    ...(currentUserId ? { user: { id: currentUserId } } : {}),
  });
};
