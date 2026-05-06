import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type WebSocketRoute,
} from '@playwright/test';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { confirmFieldTypeChangeIfNeeded } from './utils';

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
  private readonly socketClients = new Map<WebSocketRoute, string>();
  private readonly pausedClients = new Set<string>();

  constructor() {
    this.doc.on('update', (update, origin) => {
      const message = encodeSyncMessage((encoder) => syncProtocol.writeUpdate(encoder, update));
      for (const socket of this.sockets) {
        const clientId = this.socketClients.get(socket);
        if (socket !== origin && (!clientId || !this.pausedClients.has(clientId))) {
          socket.send(message);
        }
      }
    });
  }

  route =
    (clientId = 'default') =>
    (socket: WebSocketRoute) => {
      this.socketClients.set(socket, clientId);
      this.sockets.add(socket);
      socket.send(encodeSyncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, this.doc)));
      socket.onMessage((message) => {
        if (this.pausedClients.has(clientId)) return;
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
        this.socketClients.delete(socket);
      });
    };

  setClientPaused(clientId: string, paused: boolean) {
    if (paused) {
      this.pausedClients.add(clientId);
    } else {
      this.pausedClients.delete(clientId);
    }
  }
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
  clientId?: string,
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
  await context.routeWebSocket(`**/api/workspaces/${workspaceId}/yjs`, server.route(clientId));
};

const editFirstFieldName = async (page: Page, fieldName: string) => {
  const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
  await cell.dblclick();
  await page.locator('[data-testid="data-table"] input').fill(fieldName);
  await page.keyboard.press('Enter');
};

const editFirstFieldType = async (page: Page, fieldType: string) => {
  const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)');
  await cell.dblclick();
  await page.locator('[data-testid="data-table"] input').fill(fieldType);
  await page.keyboard.press('Enter');
  await confirmFieldTypeChangeIfNeeded(page);
};

const tableNameInput = (page: Page) => page.locator('#table-name');

const readDefaultDraftState = (doc: Y.Doc) => {
  const draft = doc.getMap<Y.Map<unknown>>('drafts').get(DEFAULT_DRAFT_ID);
  return readTableDocState(draft);
};

const readTableDocState = (tableDoc: Y.Map<unknown> | undefined) => {
  const snapshot = tableDoc?.get('stateSnapshot') as ReturnType<typeof createState> | undefined;
  const scalar = tableDoc?.get('scalar');
  const fields = tableDoc?.get('fields');
  const fieldOrder = tableDoc?.get('fieldOrder');
  if (!(fields instanceof Y.Map) || !(fieldOrder instanceof Y.Array)) {
    return snapshot;
  }

  return {
    ...(snapshot ?? createState('', '')),
    ...(scalar instanceof Y.Map
      ? {
          tableName:
            typeof scalar.get('tableName') === 'string'
              ? String(scalar.get('tableName'))
              : (snapshot?.tableName ?? ''),
        }
      : {}),
    rows: fieldOrder
      .toArray()
      .map((fieldId, index) => {
        const field = fields.get(String(fieldId));
        if (!(field instanceof Y.Map)) return null;
        const fallback = snapshot?.rows[index];
        return {
          order: typeof field.get('order') === 'number' ? Number(field.get('order')) : index + 1,
          fieldName:
            typeof field.get('fieldName') === 'string'
              ? String(field.get('fieldName'))
              : (fallback?.fieldName ?? ''),
          fieldType:
            typeof field.get('fieldType') === 'string'
              ? String(field.get('fieldType'))
              : (fallback?.fieldType ?? ''),
          fieldComment:
            typeof field.get('fieldComment') === 'string'
              ? String(field.get('fieldComment'))
              : (fallback?.fieldComment ?? ''),
          nullable:
            typeof field.get('nullable') === 'string'
              ? String(field.get('nullable'))
              : (fallback?.nullable ?? '是'),
          defaultKind:
            typeof field.get('defaultKind') === 'string'
              ? String(field.get('defaultKind'))
              : (fallback?.defaultKind ?? '无'),
          defaultValue:
            typeof field.get('defaultValue') === 'string'
              ? String(field.get('defaultValue'))
              : (fallback?.defaultValue ?? ''),
          onUpdate:
            typeof field.get('onUpdate') === 'string'
              ? String(field.get('onUpdate'))
              : (fallback?.onUpdate ?? '无'),
        };
      })
      .filter((row): row is ReturnType<typeof createState>['rows'][number] => row != null),
  };
};

const readMetadata = (tableDoc: Y.Map<unknown> | undefined) => {
  const metadata = tableDoc?.get('metadata');
  return metadata instanceof Y.Map ? metadata : null;
};

const readSavedTableState = (doc: Y.Doc, normalizedName: string) => {
  const tableDoc = doc.getMap<Y.Map<unknown>>('savedTables').get(normalizedName);
  return readTableDocState(tableDoc);
};

const readSavedTableFolderId = (doc: Y.Doc, normalizedName: string) => {
  const tableDoc = doc.getMap<Y.Map<unknown>>('savedTables').get(normalizedName);
  const metadata = readMetadata(tableDoc);
  const folderId = metadata?.get('folderId');
  return typeof folderId === 'string' ? folderId : undefined;
};

const findFolderIdByName = (doc: Y.Doc, name: string) => {
  for (const [id, folder] of doc.getMap<Y.Map<unknown>>('folders').entries()) {
    if (folder.get('name') === name) {
      return id;
    }
  }
  return undefined;
};

const openDraftByName = async (page: Page, name: string) => {
  try {
    await expect(tableNameInput(page)).toHaveValue(name, { timeout: 3000 });
    return;
  } catch {
    await page
      .getByRole('button', { name: new RegExp(name) })
      .first()
      .click();
    await expect(tableNameInput(page)).toHaveValue(name);
  }
};

const openSavedTables = async (page: Page) => {
  const dialog = page.getByRole('dialog', { name: /工作区/i });
  if (await dialog.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: '工作区' }).click();
  await expect(dialog).toBeVisible();
};

const saveCurrentTable = async (page: Page, name: string) => {
  await tableNameInput(page).fill(name);
  await editFirstFieldName(page, 'id');
  await editFirstFieldType(page, 'BIGINT');
  await page.getByRole('button', { name: /保存当前表/i }).click();
  await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeVisible();
  const nameInput = page.getByLabel('保存名称');
  if (await nameInput.isEnabled()) {
    await nameInput.fill(name);
  }
  await page.getByRole('button', { name: /^保存$/ }).click();
  await expect(page.getByRole('heading', { name: /保存当前表|更新保存的表/i })).toBeHidden();
};

const getSavedTableRow = (page: Page, normalizedName: string) =>
  page.getByRole('dialog', { name: /工作区/i }).getByTestId(`saved-table-row:${normalizedName}`);

const getFolderRowByName = (page: Page, name: string) =>
  page
    .getByRole('dialog', { name: /工作区/i })
    .locator('[data-testid^="folder-row:"]')
    .filter({ hasText: name })
    .first();

const createFolder = async (page: Page, name: string) => {
  await openSavedTables(page);
  await page.getByRole('button', { name: /新建文件夹/i }).click();
  await page.getByLabel('文件夹名称').fill(name);
  await page.getByRole('button', { name: /确定/i }).click();
  await expect(getFolderRowByName(page, name)).toBeVisible();
};

const dragToTarget = async (page: Page, source: Locator, target: Locator) => {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await expect(source).toBeVisible();
      await expect(target).toBeVisible();
      const sourceBox = await source.boundingBox();
      const targetBox = await target.boundingBox();
      if (!sourceBox || !targetBox) {
        throw new Error('Drag source or target missing');
      }

      await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
        steps: 12,
      });
      await page.mouse.up();
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(120);
    }
  }

  throw lastError;
};

const ensureFolderExpanded = async (page: Page, folderName: string) => {
  await expect(getFolderRowByName(page, folderName)).toBeVisible();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const expandButton = getFolderRowByName(page, folderName)
      .getByRole('button', { name: new RegExp(`展开\\s*${folderName}`, 'i') })
      .first();
    if (!(await expandButton.isVisible().catch(() => false))) {
      return;
    }
    try {
      await expandButton.click({ force: true, timeout: 2000 });
      await page.waitForTimeout(150);
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(120);
    }
  }
};

test('workspace yjs sync converges realtime edits and IndexedDB restore', async ({ browser }) => {
  const workspaceId = `ws-e2e-${Date.now()}`;
  const server = new MockWorkspaceYjsServer();
  seedDefaultDraft(server.doc, 'cloud_seed', 'id');
  const contextA = await browser.newContext({ locale: 'zh-CN' });
  const contextB = await browser.newContext({ locale: 'zh-CN' });
  await mockSignedInWorkspace(contextA, server, workspaceId, 'offline-client');
  await mockSignedInWorkspace(contextB, server, workspaceId, 'online-client');
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

test('workspace yjs sync converges saved table lifecycle and folder moves across contexts', async ({
  browser,
}) => {
  const workspaceId = `ws-saved-e2e-${Date.now()}`;
  const server = new MockWorkspaceYjsServer();
  seedDefaultDraft(server.doc, 'cloud_seed', 'id');
  const contextA = await browser.newContext({ locale: 'zh-CN' });
  const contextB = await browser.newContext({ locale: 'zh-CN' });
  await mockSignedInWorkspace(contextA, server, workspaceId, 'offline-client');
  await mockSignedInWorkspace(contextB, server, workspaceId, 'online-client');
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const tableName = `sync_saved_${Date.now()}`;
  const parentFolder = `SyncParent${Date.now()}`;
  const childFolder = `SyncChild${Date.now()}`;

  await pageA.goto('/');
  await pageB.goto('/');
  await openDraftByName(pageA, 'cloud_seed');
  await openDraftByName(pageB, 'cloud_seed');
  await saveCurrentTable(pageA, tableName);
  await expect
    .poll(() => readSavedTableState(server.doc, tableName)?.rows[0]?.fieldName)
    .toBe('id');

  await openSavedTables(pageB);
  await expect(getSavedTableRow(pageB, tableName)).toBeVisible();

  await createFolder(pageA, parentFolder);
  await createFolder(pageA, childFolder);
  const childHandle = getFolderRowByName(pageA, childFolder).getByRole('button', {
    name: /拖拽移动文件夹/i,
  });
  await dragToTarget(pageA, childHandle, getFolderRowByName(pageA, parentFolder));
  await expect
    .poll(() => {
      const parentId = findFolderIdByName(server.doc, parentFolder);
      const childId = findFolderIdByName(server.doc, childFolder);
      const child = childId ? server.doc.getMap<Y.Map<unknown>>('folders').get(childId) : undefined;
      return parentId && child?.get('parentId') === parentId;
    })
    .toBe(true);

  await openSavedTables(pageB);
  await ensureFolderExpanded(pageB, parentFolder);
  await expect(getFolderRowByName(pageB, childFolder)).toBeVisible();

  const tableHandle = getSavedTableRow(pageA, tableName).getByRole('button', {
    name: /拖拽移动表/i,
  });
  await dragToTarget(pageA, tableHandle, getFolderRowByName(pageA, parentFolder));
  await expect
    .poll(() => {
      const parentId = findFolderIdByName(server.doc, parentFolder);
      return readSavedTableFolderId(server.doc, tableName) === parentId;
    })
    .toBe(true);

  await ensureFolderExpanded(pageA, parentFolder);
  await expect(getSavedTableRow(pageA, tableName)).toBeVisible();
  await getSavedTableRow(pageA, tableName).hover();
  await pageA.getByTestId(`table-actions:${tableName}`).getByRole('button').click();
  await pageA.getByRole('menuitem', { name: /删除/i }).click();
  await expect(pageA.getByRole('heading', { name: /移入回收站/i })).toBeVisible();
  await pageA.getByRole('button', { name: /移入回收站/i }).click();
  await expect.poll(() => readSavedTableState(server.doc, tableName)).toBeUndefined();
  await expect(getSavedTableRow(pageB, tableName)).toHaveCount(0);

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

test('workspace yjs sync merges offline and online concurrent schema edits', async ({
  browser,
}) => {
  const workspaceId = `ws-concurrent-e2e-${Date.now()}`;
  const server = new MockWorkspaceYjsServer();
  seedDefaultDraft(server.doc, 'cloud_seed', 'id');
  const contextA = await browser.newContext({ locale: 'zh-CN' });
  const contextB = await browser.newContext({ locale: 'zh-CN' });
  await mockSignedInWorkspace(contextA, server, workspaceId, 'offline-client');
  await mockSignedInWorkspace(contextB, server, workspaceId, 'online-client');
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto('/');
  await pageB.goto('/');
  await openDraftByName(pageA, 'cloud_seed');
  await openDraftByName(pageB, 'cloud_seed');
  await expect(pageA.getByTestId('workspace-yjs-status')).toContainText('云端已同步');
  await expect(pageB.getByTestId('workspace-yjs-status')).toContainText('云端已同步');

  server.setClientPaused('offline-client', true);
  await contextA.setOffline(true);
  await pageA.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(pageA.getByTestId('workspace-yjs-status')).toContainText('离线，本地已保存');
  await editFirstFieldName(pageA, 'offline_id');
  await tableNameInput(pageB).fill('online_table');

  await expect(tableNameInput(pageB)).toHaveValue('online_table');
  await expect.poll(() => readDefaultDraftState(server.doc)?.tableName).toBe('online_table');
  await expect(pageA.getByTestId('workspace-yjs-status')).toContainText('离线，本地已保存');

  server.setClientPaused('offline-client', false);
  await contextA.setOffline(false);
  await pageA.evaluate(() => window.dispatchEvent(new Event('online')));

  await expect(pageA.getByTestId('workspace-yjs-status')).toContainText('云端已同步');
  await expect(
    pageA.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)'),
  ).toHaveText('offline_id');
  await expect(tableNameInput(pageA)).toHaveValue('online_table');
  await expect(
    pageB.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)'),
  ).toHaveText('offline_id');
  await expect(tableNameInput(pageB)).toHaveValue('online_table');
  await expect
    .poll(() => {
      const state = readDefaultDraftState(server.doc);
      return `${state?.tableName}:${state?.rows[0]?.fieldName}`;
    })
    .toBe('online_table:offline_id');

  await contextA.close();
  await contextB.close();
});
