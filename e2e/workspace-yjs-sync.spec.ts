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
import { WORKSPACE_SYNC_MESSAGE } from '../packages/shared-types/src/workspaceSync';
import { encodeAIStreamEvent } from '../packages/shared-types/src/aiStream';
import type { PersistedState } from '../packages/shared-types/src/index';
import { confirmFieldTypeChangeIfNeeded, ensureBuilderVisible } from './utils';
import type { WorkspaceMigrationPayload } from '../packages/shared-types/src/workspace';
import { applyWorkspaceMigrationSnapshot } from '../apps/worker/server-api/lib/workspaceMigration';
import {
  getWorkspaceSavedTable,
  upsertWorkspaceSavedTable,
} from '../packages/workspace-core/src/index';

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
        let messageType = decoding.readVarUint(decoder);
        let requestId: number | undefined;
        if (messageType === WORKSPACE_SYNC_MESSAGE.syncWithAck) {
          requestId = decoding.readVarUint(decoder);
          messageType = decoding.readVarUint(decoder);
        }
        if (messageType !== MESSAGE_SYNC) return;

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, this.doc, socket);
        if (encoding.length(encoder) > 1) {
          socket.send(Buffer.from(encoding.toUint8Array(encoder)));
        }
        if (requestId !== undefined) {
          const acknowledgement = encoding.createEncoder();
          encoding.writeVarUint(acknowledgement, WORKSPACE_SYNC_MESSAGE.persisted);
          encoding.writeVarUint(acknowledgement, requestId);
          socket.send(Buffer.from(encoding.toUint8Array(acknowledgement)));
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
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
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
          workspaceId,
        },
      });
      return;
    }
    if (url.pathname === `/api/workspaces/${workspaceId}/yjs` && request.method() === 'HEAD') {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fallback();
  });
  await context.routeWebSocket(`**/api/workspaces/${workspaceId}/yjs`, server.route(clientId));
};

const editFirstFieldName = async (page: Page, fieldName: string) => {
  const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
  await cell.dblclick();
  const input = cell.locator('input');
  await expect(input).toBeVisible();
  await input.fill(fieldName);
  await input.press('Enter');
  await expect(cell).toHaveText(fieldName);
};

const editFirstFieldType = async (page: Page, fieldType: string) => {
  const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)');
  await cell.dblclick();
  await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill(fieldType);
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
          tableComment:
            typeof scalar.get('tableComment') === 'string'
              ? String(scalar.get('tableComment'))
              : (snapshot?.tableComment ?? ''),
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
            typeof field.get('nullable') === 'boolean'
              ? Boolean(field.get('nullable'))
              : (fallback?.nullable ?? true),
          defaultKind:
            typeof field.get('defaultKind') === 'string'
              ? String(field.get('defaultKind'))
              : (fallback?.defaultKind ?? 'none'),
          defaultValue:
            typeof field.get('defaultValue') === 'string'
              ? String(field.get('defaultValue'))
              : (fallback?.defaultValue ?? ''),
          onUpdate:
            typeof field.get('onUpdate') === 'string'
              ? String(field.get('onUpdate'))
              : (fallback?.onUpdate ?? 'none'),
        };
      })
      .filter((row): row is ReturnType<typeof createState>['rows'][number] => row != null),
  };
};

const readMetadata = (tableDoc: Y.Map<unknown> | undefined) => {
  const metadata = tableDoc?.get('metadata');
  return metadata instanceof Y.Map ? metadata : null;
};

const savedTableDoc = (doc: Y.Doc, normalizedName: string) =>
  Array.from(doc.getMap<Y.Map<unknown>>('savedTables').entries()).find(
    ([key, value]) => (readMetadata(value)?.get('normalizedName') ?? key) === normalizedName,
  )?.[1];

const readSavedTableState = (doc: Y.Doc, normalizedName: string) => {
  const tableDoc = savedTableDoc(doc, normalizedName);
  return readTableDocState(tableDoc);
};

const readSavedTableFolderId = (doc: Y.Doc, normalizedName: string) => {
  const tableDoc = savedTableDoc(doc, normalizedName);
  const metadata = readMetadata(tableDoc);
  const folderId = metadata?.get('folderId');
  return typeof folderId === 'string' ? folderId : undefined;
};

const readSavedTableTrashedAt = (doc: Y.Doc, normalizedName: string) => {
  const tableDoc = savedTableDoc(doc, normalizedName);
  const trashedAt = readMetadata(tableDoc)?.get('trashedAt');
  return typeof trashedAt === 'number' ? trashedAt : undefined;
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

for (const action of ['dismiss', 'confirm'] as const) {
  test(`anonymous migration ${action} respects confirmation across reload`, async ({ browser }) => {
    const context = await browser.newContext({ locale: 'zh-CN' });
    const page = await context.newPage();
    await page.goto('/');
    await ensureBuilderVisible(page);
    await saveCurrentTable(page, 'ANONYMOUS_ORDERS');

    const server = new MockWorkspaceYjsServer();
    const workspaceId = `ws-migration-${action}-${Date.now()}`;
    await mockSignedInWorkspace(context, server, workspaceId);
    const modes: string[] = [];
    await context.route('**/api/workspace/migrations', async (route) => {
      const { mode, payload } = route.request().postDataJSON() as {
        mode: 'analyze' | 'commit';
        payload: WorkspaceMigrationPayload;
      };
      modes.push(mode);
      await route.fulfill({
        json:
          mode === 'commit'
            ? applyWorkspaceMigrationSnapshot(server.doc, 'user-1', payload.snapshot)
            : {
                status: modes.includes('commit') ? 'completed' : 'ready',
                createdCount: 1,
                copiedCount: 0,
                skippedCount: 0,
                conflictCount: 0,
                conflicts: [],
              },
      });
    });
    await page.reload();
    const dialog = page.getByRole('dialog', { name: '迁移匿名工作区' });
    await expect(dialog).toBeVisible();
    expect(server.doc.getMap('savedTables').size).toBe(0);

    await dialog
      .getByRole('button', { name: action === 'confirm' ? '开始迁移' : '稍后处理' })
      .click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('workspace-yjs-status')).toContainText('云端已同步');
    expect(modes).toEqual(action === 'confirm' ? ['analyze', 'commit'] : ['analyze']);

    await page.reload();
    await expect(page.getByTestId('workspace-yjs-status')).toContainText('云端已同步');
    await expect(dialog).toBeHidden();
    if (action === 'dismiss') {
      expect(server.doc.getMap('savedTables').size).toBe(0);
      expect(server.doc.getMap('drafts').size).toBe(0);
      expect(modes).not.toContain('commit');
    } else {
      expect(server.doc.getMap('savedTables').size).toBe(1);
      await openSavedTables(page);
      await expect(getSavedTableRow(page, 'anonymous_orders')).toBeVisible();
    }
    await context.close();
    server.doc.destroy();
  });
}

test('same-name saved tables keep independent tabs, drafts and lifecycle', async ({ browser }) => {
  const server = new MockWorkspaceYjsServer();
  const workspaceId = `ws-same-name-${Date.now()}`;
  seedDefaultDraft(server.doc, 'initial', 'id');
  for (const id of ['first', 'second']) {
    const table = new Y.Map<unknown>();
    const metadata = new Y.Map<unknown>();
    metadata.set('tableId', id);
    metadata.set('normalizedName', 'shared');
    metadata.set('name', 'Shared');
    metadata.set('createdAt', 1);
    metadata.set('updatedAt', 1);
    table.set('metadata', metadata);
    table.set('stateSnapshot', createState(id, `${id}_id`));
    server.doc.getMap<Y.Map<unknown>>('savedTables').set(id, table);
  }
  const context = await browser.newContext({ locale: 'zh-CN' });
  await mockSignedInWorkspace(context, server, workspaceId);
  const page = await context.newPage();
  const row = (id: string) =>
    page.getByRole('dialog', { name: /工作区/i }).locator(`[data-table-id="${id}"]`);
  const select = async (id: string) => {
    await openSavedTables(page);
    await row(id).getByTestId('table-select:shared').click();
    await expect(page.getByRole('dialog', { name: /工作区/i })).toBeHidden();
    await expect(tableNameInput(page)).toHaveValue(id);
  };
  await page.goto('/');
  await select('first');
  await page.locator('#table-comment').fill('first draft');
  await select('second');
  await page.locator('#table-comment').fill('second draft');
  await select('first');
  await expect(page.locator('#table-comment')).toHaveValue('first draft');
  await page.getByRole('button', { name: /保存当前表/i }).click();
  await expect
    .poll(
      () =>
        readTableDocState(server.doc.getMap<Y.Map<unknown>>('savedTables').get('first'))
          ?.tableComment,
    )
    .toBe('first draft');
  expect(
    readTableDocState(server.doc.getMap<Y.Map<unknown>>('savedTables').get('second'))?.tableComment,
  ).toBe('');
  await select('second');
  await expect(page.locator('#table-comment')).toHaveValue('second draft');
  await openSavedTables(page);
  await row('first').hover();
  await row('first').getByTestId('table-actions:shared').getByRole('button').click();
  await page.getByRole('menuitem', { name: /重命名/i }).click();
  await page.getByLabel('新名称').fill('Renamed');
  await page.getByRole('button', { name: /确认/i }).click();
  await expect
    .poll(() =>
      readMetadata(server.doc.getMap<Y.Map<unknown>>('savedTables').get('first'))?.get(
        'normalizedName',
      ),
    )
    .toBe('renamed');
  await row('first').hover();
  await row('first').getByTestId('table-actions:renamed').getByRole('button').click();
  await page.getByRole('menuitem', { name: /删除/i }).click();
  await page.getByRole('button', { name: '移入回收站', exact: true }).click();
  await expect(row('first')).toHaveCount(0);
  await row('second').getByTestId('table-select:shared').click();
  await expect(page.locator('#table-comment')).toHaveValue('second draft');
  expect(
    readMetadata(server.doc.getMap<Y.Map<unknown>>('savedTables').get('second'))?.get('trashedAt'),
  ).toBeUndefined();
  await context.close();
});

test('AI suggestions reject concurrent workspace edits and can be regenerated', async ({
  browser,
}) => {
  const workspaceId = `ws-ai-conflict-${Date.now()}`;
  const server = new MockWorkspaceYjsServer();
  seedDefaultDraft(server.doc, 'ai_conflict', 'id');
  const contextA = await browser.newContext({ locale: 'zh-CN' });
  const contextB = await browser.newContext({ locale: 'zh-CN' });
  try {
    await mockSignedInWorkspace(contextA, server, workspaceId);
    await mockSignedInWorkspace(contextB, server, workspaceId);
    await contextA.route('**/api/generate-table', async (route) => {
      const { existingConfig } = route.request().postDataJSON() as {
        existingConfig: PersistedState;
      };
      const schema = {
        tableName: existingConfig.tableName,
        tableComment: existingConfig.tableComment,
        fields: existingConfig.rows
          .filter((row) => row.fieldName)
          .map((row) => ({ ...row, fieldType: 'INT' })),
        indexes: [],
      };
      await route.fulfill({
        contentType: 'application/x-ndjson',
        body:
          encodeAIStreamEvent({ type: 'delta', text: JSON.stringify(schema) }) +
          encodeAIStreamEvent({ type: 'done' }),
      });
    });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await pageA.goto('/');
    await pageB.goto('/');
    await openDraftByName(pageA, 'ai_conflict');
    await openDraftByName(pageB, 'ai_conflict');
    await pageA.getByRole('button', { name: 'AI 修改', exact: true }).click();
    const dialog = pageA.getByRole('dialog', { name: 'AI 修改当前表' });
    await dialog.locator('#ai-patch-input').fill('将字段类型改成 INT');
    await dialog.getByRole('button', { name: '发送', exact: true }).click();
    await dialog.getByRole('button', { name: '切换变更选择' }).click();
    const commentCell = pageB
      .getByTestId('data-table')
      .locator('tbody tr')
      .first()
      .locator('td')
      .nth(2);
    await commentCell.dblclick();
    await commentCell.locator('input').fill('另一端的注释');
    await commentCell.locator('input').press('Enter');
    await pageB
      .getByTestId('data-table')
      .locator('tbody tr')
      .first()
      .locator('td')
      .nth(4)
      .getByRole('checkbox')
      .click();
    await expect(pageA.getByTestId('data-table')).toContainText('另一端的注释');
    await dialog.getByRole('button', { name: '应用 1 项变更' }).click();
    await expect(pageA.getByText(/表结构已发生变化，请基于当前内容重新生成建议/)).toBeVisible();
    await expect(dialog.getByText('类型', { exact: true })).toBeVisible();
    await expect(dialog.getByText('类型、可空、注释', { exact: true })).toHaveCount(0);
    expect(readDefaultDraftState(server.doc)?.rows[0]).toMatchObject({
      fieldType: 'BIGINT',
      fieldComment: '另一端的注释',
      nullable: true,
    });
    await dialog.getByRole('button', { name: '继续修改', exact: true }).click();
    await dialog.getByRole('button', { name: '切换变更选择' }).click();
    await dialog.getByRole('button', { name: '应用 1 项变更' }).click();
    await expect(dialog.getByText('本次没有发现可应用的结构变更')).toBeVisible();
    await expect(
      pageB.getByTestId('data-table').locator('tbody tr').first().locator('td').nth(3),
    ).toHaveText('INT');
    expect(readDefaultDraftState(server.doc)?.rows[0]).toMatchObject({
      fieldType: 'INT',
      fieldComment: '另一端的注释',
      nullable: true,
    });
  } finally {
    await contextA.close();
    await contextB.close();
    server.doc.destroy();
  }
});

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
  await expect
    .poll(() => readSavedTableTrashedAt(server.doc, tableName))
    .toEqual(expect.any(Number));
  await expect(getSavedTableRow(pageB, tableName)).toHaveCount(0);

  await contextA.close();
  await contextB.close();
});

test('saved drafts retain concurrent edits across tabs and reload', async ({ browser }) => {
  const workspaceId = `ws-saved-draft-${Date.now()}`;
  const server = new MockWorkspaceYjsServer();
  seedDefaultDraft(server.doc, 'cloud_seed', 'id');
  const contextA = await browser.newContext({ locale: 'zh-CN' });
  const contextB = await browser.newContext({ locale: 'zh-CN' });
  try {
    await mockSignedInWorkspace(contextA, server, workspaceId, 'online-client');
    await mockSignedInWorkspace(contextB, server, workspaceId, 'offline-client');
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const tableName = `saved_draft_${Date.now()}`;
    await pageA.goto('/');
    await openDraftByName(pageA, 'cloud_seed');
    await saveCurrentTable(pageA, tableName);
    await expect
      .poll(() => readSavedTableState(server.doc, tableName)?.rows[0]?.fieldName)
      .toBe('id');

    await pageB.goto('/');
    await openSavedTables(pageB);
    await getSavedTableRow(pageB, tableName).click();
    await expect(tableNameInput(pageB)).toHaveValue(tableName);
    await expect(pageB.getByTestId('data-table')).toBeVisible();
    await expect(pageB.locator('[role="tabpanel"]:visible pre code')).toBeVisible();
    server.setClientPaused('offline-client', true);
    await contextB.setOffline(true);
    await pageB.evaluate(() => window.dispatchEvent(new Event('offline')));
    await pageB.locator('#table-comment').fill('unsaved local comment');

    await pageA.locator('#table-comment').fill('remote saved comment');
    await editFirstFieldType(pageA, 'INT');
    await pageA.getByRole('button', { name: /保存当前表/i }).click();
    await expect
      .poll(() => readSavedTableState(server.doc, tableName)?.tableComment)
      .toBe('remote saved comment');

    server.setClientPaused('offline-client', false);
    await contextB.setOffline(false);
    await pageB.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(pageB.getByTestId('workspace-yjs-status')).toContainText('云端已同步');
    const assertDraft = async () => {
      await expect(pageB.locator('#table-comment')).toHaveValue('unsaved local comment');
      await expect(
        pageB.locator('[data-testid="data-table"] tbody tr:first-child td:nth-child(4)'),
      ).toHaveText('INT');
    };
    await assertDraft();
    await pageB.getByRole('button', { name: /新建草稿/i }).click();
    await pageB.locator('div[role="button"]').filter({ hasText: tableName }).click();
    await assertDraft();
    await pageB.reload();
    await openSavedTables(pageB);
    await getSavedTableRow(pageB, tableName).click();
    await assertDraft();
    expect(readSavedTableState(server.doc, tableName)?.tableComment).toBe('remote saved comment');
  } finally {
    await contextA.close();
    await contextB.close();
    server.doc.destroy();
  }
});

test('workspace yjs rename preserves an offline save and retargets open tabs', async ({
  browser,
}) => {
  const workspaceId = `ws-rename-e2e-${Date.now()}`;
  const server = new MockWorkspaceYjsServer();
  seedDefaultDraft(server.doc, 'cloud_seed', 'id');
  const contextA = await browser.newContext({ locale: 'zh-CN' });
  const contextB = await browser.newContext({ locale: 'zh-CN' });
  await mockSignedInWorkspace(contextA, server, workspaceId, 'online-client');
  await mockSignedInWorkspace(contextB, server, workspaceId, 'offline-client');
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const originalName = `rename_${Date.now()}`;
  const renamed = `${originalName}_new`;

  await pageA.goto('/');
  await openDraftByName(pageA, 'cloud_seed');
  await saveCurrentTable(pageA, originalName);
  await expect
    .poll(() => readSavedTableState(server.doc, originalName)?.rows[0]?.fieldName)
    .toBe('id');
  const originalNode = savedTableDoc(server.doc, originalName);
  await pageB.goto('/');
  await openSavedTables(pageB);
  await getSavedTableRow(pageB, originalName).click();
  await expect(tableNameInput(pageB)).toHaveValue(originalName);
  await expect(pageB.getByTestId('data-table')).toBeVisible();
  await expect(pageB.locator('[role="tabpanel"]:visible pre code')).toBeVisible();

  server.setClientPaused('offline-client', true);
  await contextB.setOffline(true);
  await pageB.evaluate(() => window.dispatchEvent(new Event('offline')));
  await editFirstFieldName(pageB, 'offline_id');
  await pageB.getByRole('button', { name: /保存当前表/i }).click();
  await expect(pageB.getByRole('button', { name: /保存当前表/i })).toBeDisabled();

  await openSavedTables(pageA);
  await getSavedTableRow(pageA, originalName).hover();
  await pageA.getByTestId(`table-actions:${originalName}`).getByRole('button').click();
  await pageA.getByRole('menuitem', { name: /重命名/i }).click();
  await pageA.getByLabel('新名称').fill(renamed);
  await pageA.getByRole('button', { name: /确认/i }).click();
  await expect.poll(() => savedTableDoc(server.doc, renamed) === originalNode).toBe(true);

  server.setClientPaused('offline-client', false);
  await contextB.setOffline(false);
  await pageB.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect
    .poll(() => readSavedTableState(server.doc, renamed)?.rows[0]?.fieldName)
    .toBe('offline_id');
  await expect(pageB.getByText(new RegExp(`当前：${renamed}`))).toBeVisible();
  await expect(
    pageB.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)'),
  ).toHaveText('offline_id');
  await pageB.locator('#table-comment').fill('edit after remote rename');
  await pageB.getByRole('button', { name: /保存当前表/i }).click();
  await expect
    .poll(() => readSavedTableState(server.doc, renamed)?.tableComment)
    .toBe('edit after remote rename');
  expect(savedTableDoc(server.doc, originalName)).toBeUndefined();
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
  await expect(page.locator('[role="tabpanel"]:visible pre code')).toBeVisible();

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

test('ER relationship deletion preserves synced edits on the selected copy', async ({
  browser,
}) => {
  const server = new MockWorkspaceYjsServer();
  const workspaceId = `ws-er-copy-${Date.now()}`;
  seedDefaultDraft(server.doc, 'initial', 'id');
  for (const id of ['original', 'copy', 'parent']) {
    const table = new Y.Map<unknown>();
    const metadata = new Y.Map<unknown>();
    metadata.set('tableId', id);
    metadata.set('normalizedName', id);
    metadata.set('name', id);
    metadata.set('createdAt', 1);
    metadata.set('updatedAt', 1);
    table.set('metadata', metadata);
    table.set('stateSnapshot', {
      ...createState(id === 'parent' ? 'parent' : 'orders', 'id'),
      foreignKeys:
        id === 'parent'
          ? []
          : [
              {
                id: 'shared-fk',
                name: 'fk_parent',
                fields: ['id'],
                refTable: 'parent',
                refFields: ['id'],
              },
            ],
    });
    server.doc.getMap<Y.Map<unknown>>('savedTables').set(id, table);
  }
  const context = await browser.newContext({ locale: 'zh-CN' });
  await mockSignedInWorkspace(context, server, workspaceId);
  const page = await context.newPage();
  try {
    await page.goto('/');
    await openDraftByName(page, 'initial');
    await openSavedTables(page);
    await getSavedTableRow(page, 'copy').getByTestId('table-select:copy').click();
    await expect(tableNameInput(page)).toHaveValue('orders');
    await page.getByRole('button', { name: 'ER 关系图', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'ER 关系图' });
    await expect(dialog.locator('.react-flow__edge')).toHaveCount(2);
    const currentCopy = getWorkspaceSavedTable(server.doc, {
      normalizedName: 'copy',
      tableId: 'copy',
    });
    if (!currentCopy) throw new Error('Copy not found');
    upsertWorkspaceSavedTable(server.doc, {
      ...currentCopy,
      updatedAt: Date.now(),
      state: {
        ...currentCopy.state,
        tableComment: 'remote comment',
        rows: [
          ...currentCopy.state.rows,
          {
            id: 'remote-field',
            fieldName: 'remote_note',
            fieldType: 'TEXT',
            fieldComment: '',
            nullable: true,
          },
        ],
      },
    });
    await expect(page.locator('#table-comment')).toHaveValue('remote comment');
    await dialog.locator(`button[data-edge-id='["copy","shared-fk"]']`).click();
    const foreignKeyCount = (id: string) => {
      const table = server.doc.getMap<Y.Map<unknown>>('savedTables').get(id);
      if (!table) throw new Error('Saved table was not found');
      const foreignKeys = table.get('foreignKeys');
      if (foreignKeys instanceof Y.Map) return foreignKeys.size;
      return (table.get('stateSnapshot') as { foreignKeys: unknown[] }).foreignKeys.length;
    };
    await expect.poll(() => foreignKeyCount('copy')).toBe(0);
    expect(foreignKeyCount('original')).toBe(1);
    const updatedCopy = getWorkspaceSavedTable(server.doc, {
      normalizedName: 'copy',
      tableId: 'copy',
    });
    expect(updatedCopy?.state.tableComment).toBe('remote comment');
    expect(updatedCopy?.state.rows.map((row) => row.fieldName)).toContain('remote_note');
    await expect(dialog.locator('.react-flow__edge')).toHaveCount(1);
  } finally {
    await context.close();
    server.doc.destroy();
  }
});
