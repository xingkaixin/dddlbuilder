import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const BOOTSTRAP_TIMEOUT_MS = 10_000;
const DEAD_SHARE_ID = '2f9c9a3e-1f2a-4c6d-8b7e-9a1c2d3e4f50';

/** 复现 IndexedDB 打不开的真实故障：open() 既不 success 也不 error，whenSynced 永远 pending。 */
const stallWorkspaceIndexedDb = async (context: BrowserContext) => {
  await context.addInitScript(() => {
    const nativeOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((name: string, version?: number) => {
      if (name.startsWith('ddlbuilder:workspace:')) {
        return {
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null,
          onblocked: null,
          result: null,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as IDBOpenDBRequest;
      }
      return version === undefined ? nativeOpen(name) : nativeOpen(name, version);
    }) as typeof indexedDB.open;
  });
};

const mockSignedInWorkspace = async (
  context: BrowserContext,
  workspaceId: string,
  options: { workspacesDelayMs?: number } = {},
) => {
  await context.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/me') {
      await route.fulfill({
        json: {
          signedIn: true,
          user: {
            userId: 'user-gate',
            email: 'gate-e2e@ddlbuilder.dev',
            emailVerified: true,
            name: 'Gate E2E',
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
      if (options.workspacesDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.workspacesDelayMs));
      }
      await route.fulfill({
        json: {
          workspaceId,
        },
      });
      return;
    }
    if (url.pathname.startsWith('/api/share/')) {
      await route.fulfill({
        status: 404,
        json: { error: 'Share not found', code: 'SHARE_NOT_FOUND' },
      });
      return;
    }
    await route.fallback();
  });
};

/** 草稿键形如 `<scope>::<draftId>`，前缀直接暴露了这次写入落进了哪个本地分区。 */
const readWorkspaceDraftScopes = (page: Page) =>
  page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ddlbuilder');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = db
        .transaction('workspace_global_draft', 'readonly')
        .objectStore('workspace_global_draft')
        .getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return [...new Set(keys.map((key) => String(key).split('::')[0]))].sort();
  });

/**
 * y-indexeddb 的落盘是异步的，reload 前必须确认这次写入已经进了本地 update log，
 * 否则测到的是刷新竞态而不是门禁。Yjs update 里的字符串按 UTF-8 原样编码，可以直接扫。
 */
const workspaceYDocPersisted = (page: Page, workspaceId: string, needle: string) =>
  page.evaluate(
    async ([dbName, text]) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (!db.objectStoreNames.contains('updates')) {
        db.close();
        return false;
      }
      const updates = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction('updates', 'readonly').objectStore('updates').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      const decoder = new TextDecoder();
      return updates.some((update) => decoder.decode(update as Uint8Array).includes(text));
    },
    [`ddlbuilder:workspace:${workspaceId}`, needle] as const,
  );

test('workspace ydoc gate blocks every write entry point until local load settles', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'zh-CN' });
  await stallWorkspaceIndexedDb(context);
  await mockSignedInWorkspace(context, `ws-gate-e2e-${Date.now()}`);
  const page = await context.newPage();

  await page.goto('/');
  await expect(page.getByTestId('workspace-bootstrap-loading')).toBeVisible();
  await expect(page.getByRole('button', { name: '新建草稿' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新建文件夹' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /保存当前表/ })).toHaveCount(0);

  await expect(page.getByTestId('workspace-bootstrap-error')).toBeVisible({
    timeout: BOOTSTRAP_TIMEOUT_MS + 5_000,
  });
  await expect(page.getByRole('button', { name: '重试加载' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建草稿' })).toHaveCount(0);

  await context.close();
});

test('a dead share link falls back into the gate instead of a writable workspace', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'zh-CN' });
  await stallWorkspaceIndexedDb(context);
  await mockSignedInWorkspace(context, `ws-gate-share-${Date.now()}`);
  const page = await context.newPage();

  await page.goto(`/share/${DEAD_SHARE_ID}`);

  // 分享失效会把 URL 改回首页；此后主工作区还没加载完，写入入口必须消失而不是保持可点。
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('workspace-bootstrap-loading')).toBeVisible();
  await expect(page.getByRole('button', { name: '新建草稿' })).toHaveCount(0);

  await expect(page.getByTestId('workspace-bootstrap-error')).toBeVisible({
    timeout: BOOTSTRAP_TIMEOUT_MS + 5_000,
  });
  await expect(page.getByRole('button', { name: '新建草稿' })).toHaveCount(0);

  await context.close();
});

test('gate stays closed until workspaceId lands, then the workspace persists writes', async ({
  browser,
}) => {
  const workspaceId = `ws-gate-slow-${Date.now()}`;
  const context = await browser.newContext({ locale: 'zh-CN' });
  await mockSignedInWorkspace(context, workspaceId, { workspacesDelayMs: 6_000 });
  const page = await context.newPage();

  await page.goto('/');

  // /api/workspaces 还在路上：已经确定是登录用户，但写入目标分区还没定，入口必须不可达。
  const createDraft = page.getByRole('button', { name: '新建草稿' });
  await expect(page.getByTestId('workspace-bootstrap-loading')).toBeVisible();
  await expect(createDraft).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新建文件夹' })).toHaveCount(0);

  await expect(createDraft).toBeVisible({ timeout: BOOTSTRAP_TIMEOUT_MS + 5_000 });
  await createDraft.click();

  const tableNameInput = page.locator('#table-name');
  await expect(tableNameInput).toBeVisible();
  await tableNameInput.fill('GATE_AFTER_WORKSPACE');
  // 草稿摘要刷新说明 saveState 已经跑过（表名写入本身走 500ms 防抖）。
  await expect(page.getByText('GATE_AFTER_WORKSPACE').first()).toBeVisible();

  // 同步工作区只写 Y.Doc，本地业务库不再保留第二份活动草稿。
  await expect.poll(() => readWorkspaceDraftScopes(page), { timeout: 10_000 }).toEqual([]);

  await expect
    .poll(() => workspaceYDocPersisted(page, workspaceId, 'GATE_AFTER_WORKSPACE'), {
      timeout: 10_000,
    })
    .toBe(true);

  await page.reload();
  await expect(page.getByText('GATE_AFTER_WORKSPACE').first()).toBeVisible({
    timeout: BOOTSTRAP_TIMEOUT_MS + 5_000,
  });

  await context.close();
});
