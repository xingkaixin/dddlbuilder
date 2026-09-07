import { expect, type Page } from '@playwright/test';

/**
 * 如果触发了字段类型变更风险确认对话框，点击"仍然修改"确认。
 * 用于 E2E 测试中跨类型修改 fieldType 的场景。
 */
export async function confirmFieldTypeChangeIfNeeded(page: Page): Promise<void> {
  const confirmButton = page.getByRole('button', { name: '仍然修改' });
  try {
    await confirmButton.waitFor({ state: 'visible', timeout: 800 });
    await confirmButton.click();
  } catch {
    // 未出现对话框，无需处理
  }
}

/**
 * 确保 Builder 主界面已显示。
 * 若页面处于空状态（无标签页），则点击"创建新表"进入 Builder。
 */
export async function ensureBuilderVisible(page: Page): Promise<void> {
  const tableNameInput = page.locator('#table-name');
  try {
    await tableNameInput.waitFor({ state: 'visible', timeout: 3000 });
  } catch {
    await page.getByRole('button', { name: '创建新表' }).click();
    await tableNameInput.waitFor({ state: 'visible', timeout: 10000 });
  }
  await page.getByRole('button', { name: '对照', exact: true }).click();
}

/**
 * 在 Builder 中手动填入 HYDRATION_CHECK 的初始测试数据，
 * 替代此前通过 localStorage 注入后自动水合的方式。
 */
export async function setupHydratedState(page: Page): Promise<void> {
  await ensureBuilderVisible(page);

  const tableNameInput = page.locator('#table-name');
  await tableNameInput.fill('HYDRATION_CHECK');

  const cell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
  await cell.dblclick();
  await page
    .locator('[data-testid="data-table"] input:not([aria-hidden="true"])')
    .fill('HYDRATED_FIELD');
  await page.keyboard.press('Enter');

  const typeCell = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(4)');
  await typeCell.dblclick();
  await page.locator('[data-testid="data-table"] input:not([aria-hidden="true"])').fill('INT');
  await page.keyboard.press('Enter');

  await expect(tableNameInput).toHaveValue('HYDRATION_CHECK');
  await expect(cell).toHaveText('HYDRATED_FIELD');
}

export async function openTableAction(page: Page, name: string | RegExp): Promise<void> {
  await page
    .getByTestId('table-config-actions')
    .getByRole('button', { name: '更多', exact: true })
    .click();
  await page.getByRole('menuitem', { name, exact: typeof name === 'string' }).click();
}

export async function openFieldTool(
  page: Page,
  group: 'AI 工具' | '数据工具',
  name: string | RegExp,
): Promise<void> {
  await page.getByRole('button', { name: group, exact: true }).click();
  await page.getByRole('menuitem', { name, exact: typeof name === 'string' }).click();
}

export async function openAdvancedSettings(page: Page, name: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: '高级设置', exact: true }).click();
  await page.getByRole('menuitem', { name }).click();
}

export async function setSchemaName(page: Page, value: string): Promise<void> {
  await page.getByRole('button', { name: '表属性', exact: true }).click();
  await page.locator('#schema-name').fill(value);
  await page.keyboard.press('Escape');
}
