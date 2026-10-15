import type { Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { AIConversationRoute } from '../packages/shared-types/src/aiConversation';

type Operation = {
  operationId: string;
  conversationId: string;
  route: AIConversationRoute;
  result?: object;
  cancelled?: boolean;
};

export const createAIConversationMock = (userId = 'e2e-user') => {
  const operations = new Map<string, Operation>();

  const find = (route: Route) =>
    operations.get(new URL(route.request().url()).pathname.split('/')[4]);
  const snapshot = (operation: Operation) => ({
    operationId: operation.operationId,
    conversationId: operation.conversationId,
    status: operation.cancelled ? 'cancelled' : operation.result ? 'succeeded' : 'running',
    text: operation.result ? JSON.stringify(operation.result) : '',
    result: operation.result ?? null,
    thinking: '',
    suggestions: [],
    error: operation.cancelled ? 'Cancelled' : null,
    accountingPending: false,
  });

  return {
    path: (route: Route) => find(route)?.route ?? new URL(route.request().url()).pathname,
    async handle(route: Route) {
      const path = new URL(route.request().url()).pathname;

      if (path === '/api/ai/operations') {
        // SAFETY: the browser fixture receives the typed prepare request produced by the AI client.
        const input = route.request().postDataJSON() as {
          route: AIConversationRoute;
          conversationId?: string;
        };

        const operation = {
          operationId: randomUUID(),
          conversationId: input.conversationId ?? randomUUID(),
          route: input.route,
        };
        operations.set(operation.operationId, operation);
        await route.fulfill({ status: 201, json: { ...operation, userId } });

        return true;
      }

      const operation = find(route);

      if (!operation) return false;

      if (path.endsWith('/stop')) operation.cancelled = true;
      else if (route.request().method() === 'POST') return false;

      if (path.endsWith('/events'))
        await route.fulfill({
          contentType: 'application/x-ndjson',
          body: JSON.stringify(snapshot(operation)) + '\n',
        });
      else await route.fulfill({ json: snapshot(operation) });

      return true;
    },
    async fulfill(
      route: Route,
      response: { json?: object; status?: number; body?: string; contentType?: string },
    ) {
      const operation = find(route);

      if (operation && (!response.status || response.status < 400)) {
        operation.result = response.json;
        await route.fulfill({ json: snapshot(operation) });
      } else await route.fulfill(response);
    },
  };
};
