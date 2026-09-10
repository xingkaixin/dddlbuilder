import type { Context } from 'hono';
import { matchedRoutes } from 'hono/route';
import { createLogger } from 'evlog';
import { initWorkersLogger, withEvlog, type EvlogWorkersOptions } from 'evlog/workers';
import type { ApiEnv, WorkerRequestLogger } from './context.js';

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;
const API_PATH_PREFIX = '/api';

type RuntimeGlobal = typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
};

// SAFETY: process is optional in the Worker runtime; this is a capability probe for local tooling only.
const getRuntimeProcess = () => (globalThis as RuntimeGlobal).process;

const isVitest = () => {
  const runtimeProcess = getRuntimeProcess();

  return runtimeProcess?.env?.VITEST === 'true';
};

const getRuntimeEnvironment = () => {
  const runtimeEnv = getRuntimeProcess()?.env;

  return runtimeEnv?.ENVIRONMENT?.trim() || runtimeEnv?.NODE_ENV?.trim() || undefined;
};

let configuredEnvironment: string | undefined;

export const configureWorkerLogging = (
  enabled = !isVitest(),
  environment = getRuntimeEnvironment(),
) => {
  configuredEnvironment = environment;
  initWorkersLogger({
    enabled,
    env: {
      service: 'ddlbuilder-worker',
      ...(environment ? { environment } : {}),
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
        '**.debugInput',
        '**.state',
        '**.snapshot',
        '**.yjsUpdate',
      ],
    },
  });
};

configureWorkerLogging();

const configureWorkerLoggingFromEnvironment = (environment: string | undefined) => {
  const normalized = environment?.trim() || undefined;

  if (!normalized || normalized === configuredEnvironment) return;
  configureWorkerLogging(!isVitest(), normalized);
};

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
    if (env.ENVIRONMENT) {
      log.set({ deployment: { environment: env.ENVIRONMENT } });
    }

    const response = await handler(
      request,
      {
        ...env,
        // SAFETY: withEvlog's open field bag is adapted to the WorkerRequestLogger fields consumed by this Worker request handler.
        EVLOG_REQUEST_LOG: log as WorkerRequestLogger,
      },
      // SAFETY: withEvlog provides the platform execution context required by the Worker handler.
      ctx as ExecutionContext,
    );

    if (response.status >= 500) log.setLevel('error');
    else if (response.status >= 400) log.setLevel('warn');

    return response;
  }, WORKER_LOGGING_OPTIONS);

  return (request, env, ctx) => {
    configureWorkerLoggingFromEnvironment(env.ENVIRONMENT);

    // SAFETY: Cloudflare invokes the Worker fetch handler with an ExecutionContext.
    return loggedWorker.fetch(normalizeApiRequestId(request), env, ctx as ExecutionContext);
  };
};

export const getRequestLogger = (c: Context<ApiEnv>): WorkerRequestLogger | undefined =>
  c.get('log');

export const toWorkerError = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- this adapter normalizes arbitrary platform failures into Error.
  error: unknown,
  fallback: string,
) => {
  if (error instanceof Error) return error;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- error normalization accepts primitive platform failures.
  if (typeof error === 'string') return new Error(error);

  return new Error(fallback);
};

export const logWorkerBackgroundError = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- background failures arrive from arbitrary asynchronous work.
  error: unknown,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- background log context is an open structured field bag.
  context: Record<string, unknown>,
  waitUntil?: (promise: Promise<unknown>) => void,
  environment?: string,
) => {
  configureWorkerLoggingFromEnvironment(environment);
  const log = createLogger({ background: context }, { waitUntil });
  log.error(toWorkerError(error, 'Worker background task failed'));
  log.emit();
};

export const createWorkerBackgroundLogger = (
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- background log context is an open structured field bag.
  context: Record<string, unknown>,
  waitUntil: (promise: Promise<unknown>) => void,
  environment?: string,
) => {
  configureWorkerLoggingFromEnvironment(environment);

  return createLogger(context, { waitUntil });
};

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
