import type { Context, Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { authenticateRequest } from '../lib/auth.js';
import { errorResponse } from '../lib/http.js';
import { assertWorkspaceOwner, WorkspaceNotFoundError } from '../lib/workspaceEntities.js';
import { isWorkspaceSnapshot } from './workspaceSnapshot.js';

const readUser = async (c: Context<ApiEnv>) => {
  try {
    return await authenticateRequest(c);
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
      return null;
    }
    throw error;
  }
};

const getWorkspaceYDocStub = (env: ApiEnv['Bindings'], workspaceId: string) => {
  const namespace = env.WORKSPACE_YDOC;
  if (!namespace) return null;
  return namespace.get(namespace.idFromName(workspaceId));
};

const buildForwardedRequest = (
  request: Request,
  workspaceId: string,
  userId: string,
  body?: BodyInit,
) => {
  const headers = new Headers(request.headers);
  headers.set('x-ddlbuilder-workspace-id', workspaceId);
  headers.set('x-ddlbuilder-user-id', userId);
  return new Request(request.url, {
    method: request.method,
    headers,
    body,
  });
};

type WorkspaceYDocAuthResult =
  | { userId: string; workspaceId: string; stub: DurableObjectStub }
  | { response: Response };

const authenticateWorkspaceRequest = async (
  c: Context<ApiEnv>,
): Promise<WorkspaceYDocAuthResult> => {
  const user = await readUser(c);
  if (!user) {
    return {
      response: errorResponse(c, 401, 'Authentication required', 'AUTH_REQUIRED'),
    };
  }

  const workspaceId = c.req.param('workspaceId');
  if (!workspaceId) {
    return {
      response: errorResponse(c, 400, 'Invalid workspace id', 'INVALID_JSON'),
    };
  }

  try {
    await assertWorkspaceOwner(c.env, user.userId, workspaceId);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) {
      return {
        response: errorResponse(c, 403, 'Workspace access denied', 'SERVICE_UNAVAILABLE'),
      };
    }
    throw error;
  }

  const stub = getWorkspaceYDocStub(c.env, workspaceId);
  if (!stub) {
    return {
      response: errorResponse(c, 503, 'Workspace sync unavailable', 'SERVICE_UNAVAILABLE'),
    };
  }

  return { userId: user.userId, workspaceId, stub };
};

export function registerWorkspaceYDocRoutes(app: Hono<ApiEnv>) {
  app.get('/workspaces/:workspaceId/yjs', async (c) => {
    let authenticated;
    try {
      authenticated = await authenticateWorkspaceRequest(c);
    } catch (error) {
      console.error('[workspace-yjs] auth failed', error);
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }
    if ('response' in authenticated) return authenticated.response;

    if (c.req.raw.method === 'HEAD') {
      return new Response(null, { status: 204 });
    }

    return authenticated.stub.fetch(
      buildForwardedRequest(c.req.raw, authenticated.workspaceId, authenticated.userId),
    );
  });

  app.get('/workspaces/:workspaceId/yjs/state', async (c) => {
    let authenticated;
    try {
      authenticated = await authenticateWorkspaceRequest(c);
    } catch (error) {
      console.error('[workspace-yjs] state auth failed', error);
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }
    if ('response' in authenticated) return authenticated.response;

    return authenticated.stub.fetch(
      buildForwardedRequest(c.req.raw, authenticated.workspaceId, authenticated.userId),
    );
  });

  app.post('/workspaces/:workspaceId/yjs/import', async (c) => {
    let authenticated;
    try {
      authenticated = await authenticateWorkspaceRequest(c);
    } catch (error) {
      console.error('[workspace-yjs] import auth failed', error);
      return errorResponse(c, 503, 'Authentication service unavailable', 'SERVICE_UNAVAILABLE');
    }
    if ('response' in authenticated) return authenticated.response;

    const rawBody = await c.req.text();
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON');
    }

    if (!isWorkspaceSnapshot(body)) {
      return errorResponse(c, 400, 'Invalid workspace snapshot payload', 'INVALID_JSON');
    }

    return authenticated.stub.fetch(
      buildForwardedRequest(c.req.raw, authenticated.workspaceId, authenticated.userId, rawBody),
    );
  });
}
