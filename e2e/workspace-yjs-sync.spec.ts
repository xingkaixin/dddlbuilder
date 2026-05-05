import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type WebSocketRoute,
} from '@playwright/test';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';

const MESSAGE_SYNC = 0;
const DEFAULT_DRAFT_ID = 'default';

const encodeSyncMessage = (write: (encoder: encoding.Encoder) => void) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  write(encoder);
  return Buffer.from(encoding.toUint8Array(encoder));
};

class MockWorkspaceYjsServer {
  readonly doc = new Y.Doc();
  private readonly sockets = new Set<WebSocketRoute>();

  constructor() {
    this.doc.on('update', (update, origin) => {
      const message = encodeSyncMessage((encoder) => syncProtocol.writeUpdate(encoder, update));
      for (const socket of this.sockets) {
        if (socket !== origin) {
          socket.send(message);
        }
      }
    });
  }

  route = (socket: WebSocketRoute) => {
    this.sockets.add(socket);
    socket.send(encodeSyncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, this.doc)));
    socket.onMessage((message) => {
      if (typeof message === 'string') return;
      const decoder = decoding.createDecoder(new Uint8Array(message));
      if (decoding.readVarUint(decoder) !== MESSAGE_SYNC) return;

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, socket);
      if (encoding.length(encoder) > 1) {
        socket.send(Buffer.from(encoding.toUint8Array(encoder)));
      }
    });
    socket.onClose(() => {
      this.sockets.delete(socket);
    });
  };
}

const createState = (tableName: string, fieldName: string) => ({
  schemaName: '',
  objectType: 'table',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  viewDefinition: '',
  viewCreateOrReplace: true,
  rows: [
    {
      order: 1,
      fieldName,
      fieldType: 'BIGINT',
      fieldComment: '',
      nullable: '否',
      defaultKind: '无',
      defaultValue: '',
      onUpdate: '无',
    },
  ],
  addCount: 12,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
  foreignKeys: [],
});

const seedDefaultDraft = (doc: Y.Doc, tableName: string, fieldName: string) => {
  doc.transact(() => {
    doc.getMap('meta').set('schemaVersion', 1);
    const draft = new Y.Map<unknown>();
    const metadata = new Y.Map<unknown>();
    metadata.set('updatedAt', Date.now());
    draft.set('metadata', metadata);
    draft.set('stateSnapshot', createState(tableName, fieldName));
    doc.getMap<Y.Map<unknown>>('drafts').set(DEFAULT_DRAFT_ID, draft);
  });
};

const mockSignedInWorkspace = async (
  context: BrowserContext,
  server: MockWorkspaceYjsServer,
  workspaceId: string,
) => {
  await context.addInitScript(
    ({ workspace }) => {
      indexedDB.deleteDatabase('ddlbuilder');
      indexedDB.deleteDatabase(`ddlbuilder:workspace:${workspace}`);
    },
    { workspace: workspaceId },
  );
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/me') {
      await route.fulfill({
        json: {
          signedIn: true,
          user: {
            userId: 'user-1',
            email: 'sync-e2e@ddlbuilder.dev',
            emailVerified: true,
            name: 'Sync E2E',
          },
          meta: { requestId: 'e2e' },
        },
      });
      return;
    }
    if (url.pathname === '/api/credits/balance') {
      await route.fulfill({ json: { balance: 10000 } });
      return;
    }
    if (url.pathname === '/api/workspaces') {
      await route.fulfill({
        json: {
          activeWorkspaceId: workspaceId,
          workspaces: [
            {
              id: workspaceId,
              name: 'Default Workspace',
              isDefault: true,
              updatedAt: 1,
            },
          ],
        },
      });
      return;
    }
    if (url.pathname === `/api/workspaces/${workspaceId}/yjs` && request.method() === 'HEAD') {
      await route.fulfill({ status: 204 });
      return;
    }
    if (url.pathname === `/api/workspaces/${workspaceId}/changes`) {
      if (request.method() === 'POST') {
        await route.fulfill({ json: { cursor: 0, accepted: [], conflicts: [] } });
        return;
      }
      await route.fulfill({ json: { workspaceId, cursor: 0, entities: [] } });
      return;
    }
    await route.fallback();
  });
  await context.routeWebSocket(`**/api/workspaces/${workspaceId}/yjs`, server.route);
};

const editFirstFieldName = async (page: Page, fieldName: string) => {
  const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
  await cell.dblclick();
  await page.locator('[data-testid="data-table"] input').fill(fieldName);
  await page.keyboard.press('Enter');
};

const tableNameInput = (page: Page) => page.getByPlaceholder('例如: order_info');

const readDefaultDraftState = (doc: Y.Doc) => {
  const draft = doc.getMap<Y.Map<unknown>>('drafts').get(DEFAULT_DRAFT_ID);
  return draft?.get('stateSnapshot') as ReturnType<typeof createState> | undefined;
};

const openDraftByName = async (page: Page, name: string) => {
  try {
    await tableNameInput(page).waitFor({ state: 'visible', timeout: 1000 });
    return;
  } catch {
    await page
      .getByRole('button', { name: new RegExp(name) })
      .first()
      .click();
    await tableNameInput(page).waitFor({ state: 'visible' });
  }
};

test('workspace yjs sync converges realtime edits and IndexedDB restore', async ({ browser }) => {
  const workspaceId = `ws-e2e-${Date.now()}`;
  const server = new MockWorkspaceYjsServer();
  seedDefaultDraft(server.doc, 'cloud_seed', 'id');
  const contextA = await browser.newContext({ locale: 'zh-CN' });
  const contextB = await browser.newContext({ locale: 'zh-CN' });
  await mockSignedInWorkspace(contextA, server, workspaceId);
  await mockSignedInWorkspace(contextB, server, workspaceId);
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto('/');
  await pageB.goto('/');
  await openDraftByName(pageA, 'cloud_seed');
  await openDraftByName(pageB, 'cloud_seed');
  await tableNameInput(pageA).fill('sync_realtime');
  await editFirstFieldName(pageA, 'local_id');

  await expect(tableNameInput(pageB)).toHaveValue('sync_realtime');
  await expect(
    pageB.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)'),
  ).toHaveText('local_id');

  const restoreContext = await browser.newContext({ locale: 'zh-CN' });
  await mockSignedInWorkspace(restoreContext, server, workspaceId);
  const restoredPage = await restoreContext.newPage();
  await restoredPage.goto('/');
  await openDraftByName(restoredPage, 'sync_realtime');
  await expect(tableNameInput(restoredPage)).toHaveValue('sync_realtime');
  await expect(
    restoredPage.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)'),
  ).toHaveText('local_id');

  await restoreContext.close();
  await contextA.close();
  await contextB.close();
});

test('workspace yjs sync preserves offline edits locally and converges after reconnect', async ({
  browser,
}) => {
  const workspaceId = `ws-offline-e2e-${Date.now()}`;
  const server = new MockWorkspaceYjsServer();
  seedDefaultDraft(server.doc, 'cloud_seed', 'id');
  const context = await browser.newContext({ locale: 'zh-CN' });
  await mockSignedInWorkspace(context, server, workspaceId);
  const page = await context.newPage();

  await page.goto('/');
  await openDraftByName(page, 'cloud_seed');
  await expect(page.getByTestId('workspace-yjs-status')).toContainText('云端已同步');

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await tableNameInput(page).fill('offline_local');
  await editFirstFieldName(page, 'offline_id');
  await expect(page.getByTestId('workspace-yjs-status')).toContainText('离线，本地已保存');
  await expect(tableNameInput(page)).toHaveValue('offline_local');
  await page.waitForTimeout(700);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await expect(page.getByTestId('workspace-yjs-status')).toContainText('云端已同步');
  await expect.poll(() => readDefaultDraftState(server.doc)?.tableName).toBe('offline_local');
  expect(readDefaultDraftState(server.doc)?.rows[0]?.fieldName).toBe('offline_id');

  await context.close();
});
