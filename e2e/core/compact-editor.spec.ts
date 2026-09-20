import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 382, height: 582 } });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '一键加载示例', exact: true }).click();
  await expect(page.getByTestId('data-table')).toBeVisible();
});

test('窄屏直接显示字段，配置和编辑内容在窗口展开后保留', async ({ page }) => {
  const table = page.getByTestId('data-table');
  const footer = page.getByTestId('editor-surface').locator('footer');
  const fourthField = await table.locator('tbody tr').nth(3).locator('td').nth(1).boundingBox();
  const footerBox = await footer.boundingBox();

  if (!fourthField || !footerBox) throw new Error('The editor must show fields and its status');
  expect(fourthField.y + fourthField.height).toBeLessThanOrEqual(footerBox.y);
  await expect(page.getByRole('button', { name: '保存当前表', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: '数据库工具', exact: true })).toBeInViewport();

  const details = page.getByRole('button', { name: '编辑表信息', exact: true });
  await details.click();
  await page.locator('#table-name').fill('duo_profile');
  await page.locator('#table-comment').fill('折叠前的编辑');
  await details.click();
  await expect(details).toContainText('duo_profile');

  const configuration = page.getByRole('combobox', { name: '切换配置' });

  for (const value of ['indexes', 'foreignKeys', 'auth', 'misc', 'partition']) {
    await configuration.selectOption(value);
    await expect(configuration).toHaveValue(value);
    const label = await configuration.locator('option:checked').innerText();
    await expect(page.getByRole('tabpanel', { name: label, exact: true })).toBeVisible();
  }

  await page.setViewportSize({ width: 951, height: 570 });
  await expect(configuration).toBeHidden();
  await expect(page.getByRole('button', { name: '高级设置', exact: true })).toContainText(
    '分区配置',
  );
  await expect(page.locator('#table-name')).toHaveValue('duo_profile');
  await expect(page.locator('#table-comment')).toHaveValue('折叠前的编辑');
  await page.setViewportSize({ width: 382, height: 582 });
  await expect(configuration).toHaveValue('partition');
  await configuration.selectOption('fields');
  await expect(table.locator('tbody tr').first()).toContainText('id');

  await page.getByRole('button', { name: '生成结果', exact: true }).click();
  await expect(page.getByTestId('output-panel').locator('pre')).toContainText('duo_profile');
  await page.getByRole('button', { name: '设计', exact: true }).click();
  const lastCell = table.locator('tbody tr').first().locator('td').last();
  await lastCell.scrollIntoViewIfNeeded();
  await expect(lastCell).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(382);
});

test('窄屏字段工具可展开，模板和冻结仍可操作', async ({ page }) => {
  const tools = page.getByRole('button', { name: '字段工具', exact: true });
  const templates = page.getByRole('button', { name: '应用模板', exact: true });
  await expect(templates).toBeHidden();
  await tools.click();
  await expect(tools).toHaveAttribute('aria-expanded', 'true');
  await templates.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  const freeze = page.getByRole('switch', { name: '启用字段表格列冻结' });
  await freeze.click();
  await expect(freeze).toBeChecked();
  await tools.click();
  await expect(templates).toBeHidden();
  const rows = page.getByTestId('data-table').locator('tbody tr');
  const before = await rows.count();
  await page.getByRole('button', { name: '添加行', exact: true }).click();
  await expect(rows).toHaveCount(before + 10);
});

test.describe('触屏字段编辑', () => {
  test.use({ hasTouch: true });

  test('内外屏编辑字号为 16px，失焦后字段内容和表格宽度保持不变', async ({ page }) => {
    const table = page.getByTestId('data-table');
    const firstRow = table.locator('tbody tr').first();

    for (const width of [382, 951]) {
      await page.setViewportSize({ width, height: 582 });
      const tableWidth = await table.evaluate((element) => element.getBoundingClientRect().width);

      for (const column of ['fieldName', 'fieldType']) {
        const cell = firstRow.locator(`[data-column-id="${column}"]`);
        const initialValue = (await cell.innerText()).trim();

        if (column === 'fieldName') await cell.tap();
        else await cell.dblclick();
        const input = cell.getByRole('textbox');
        await expect(input).toBeFocused();
        await expect(input).toHaveCSS('font-size', '16px');
        await expect(input).toHaveValue(initialValue);
        await page.getByRole('button', { name: '生成结果', exact: true }).focus();
        await expect(input).toBeHidden();
        await expect(cell).toHaveText(initialValue);
        expect(await table.evaluate((element) => element.getBoundingClientRect().width)).toBe(
          tableWidth,
        );
      }

      const lastCell = firstRow.locator('td').last();
      await lastCell.scrollIntoViewIfNeeded();
      await expect(lastCell).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
  });
});
