import type { Context, Hono } from 'hono';
import type { ApiEnv } from '../lib/context.js';
import { authenticateRequest } from '../lib/auth.js';
import { errorResponse, parseJsonBodyWithLimit } from '../lib/http.js';
import { assertWorkspaceOwner, WorkspaceNotFoundError } from '../lib/workspaceEntities.js';
import { decodeWorkspaceSnapshot } from '../lib/workspaceSnapshotValidation.js';

const IMPORT_BODY_MAX_BYTES = 5 * 1024 * 1024;

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
  const user = await authenticateRequest(c);

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
        response: errorResponse(c, 403, 'Workspace access denied', 'WORKSPACE_ACCESS_DENIED'),
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

const withAuthenticatedWorkspace = async (
  c: Context<ApiEnv>,
  handle: (auth: {
    userId: string;
    workspaceId: string;
    stub: DurableObjectStub;
  }) => Promise<Response>,
) => {
  const authenticated = await authenticateWorkspaceRequest(c);
  if ('response' in authenticated) return authenticated.response;
  return handle(authenticated);
};

export function registerWorkspaceYDocRoutes(app: Hono<ApiEnv>) {
  app.get('/workspaces/:workspaceId/yjs', async (c) =>
    withAuthenticatedWorkspace(c, async (authenticated) => {
      if (c.req.raw.method === 'HEAD') {
        return new Response(null, { status: 204 });
      }
      return authenticated.stub.fetch(
        buildForwardedRequest(c.req.raw, authenticated.workspaceId, authenticated.userId),
      );
    }),
  );

  app.get('/workspaces/:workspaceId/yjs/state', async (c) =>
    withAuthenticatedWorkspace(c, async (authenticated) =>
      authenticated.stub.fetch(
        buildForwardedRequest(c.req.raw, authenticated.workspaceId, authenticated.userId),
      ),
    ),
  );

  app.post('/workspaces/:workspaceId/yjs/import', async (c) =>
    withAuthenticatedWorkspace(c, async (authenticated) => {
      const parsedBody = await parseJsonBodyWithLimit<unknown>(c, IMPORT_BODY_MAX_BYTES);
      if (parsedBody.errorResponse) return parsedBody.errorResponse;
      const body = parsedBody.data;

      const snapshot = decodeWorkspaceSnapshot(body);
      if (!snapshot) {
        return errorResponse(c, 400, 'Invalid workspace snapshot payload', 'INVALID_JSON');
      }

      return authenticated.stub.fetch(
        buildForwardedRequest(
          c.req.raw,
          authenticated.workspaceId,
          authenticated.userId,
          JSON.stringify(snapshot),
        ),
      );
    }),
  );
}
