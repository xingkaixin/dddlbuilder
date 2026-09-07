import { test, expect } from '@playwright/test';
import { setupHydratedState } from '../utils';

test('Field standards retain references and require explicit application of changes @fields', async ({
  page,
}) => {
  await page.goto('/');
  await setupHydratedState(page);
  await page.getByRole('button', { name: '字段标准库', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('当前表字段', { exact: true }).selectOption({ label: 'HYDRATED_FIELD' });
  await dialog.getByRole('button', { name: '从此字段创建标准', exact: true }).click();
  await dialog.getByLabel('业务名称', { exact: true }).fill('业务标识');
  await dialog.getByLabel('业务定义', { exact: true }).fill('业务对象的唯一标识');
  await dialog.getByLabel('业务单位', { exact: true }).fill('个');
  await dialog.getByRole('button', { name: '保存标准', exact: true }).click();
  await dialog.getByRole('button', { name: '仅关联，不修改字段', exact: true }).click();
  await expect(dialog.getByText('符合标准', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '编辑标准', exact: true }).click();
  const typeCell = dialog.locator('td[data-column-id="fieldType"]').first();
  await typeCell.dblclick();
  await typeCell.locator('input').fill('BIGINT');
  await typeCell.locator('input').press('Enter');
  await dialog.getByRole('button', { name: '保存标准', exact: true }).click();
  await expect(dialog.getByText('1 项偏差', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page
      .locator('[data-testid="data-table"] tbody tr')
      .first()
      .locator('td[data-column-id="fieldType"]'),
  ).toHaveText('INT');
  await page.reload();
  await page.locator('aside').getByRole('button', { name: 'HYDRATION_CHECK', exact: true }).click();
  await page.getByRole('button', { name: '字段标准库', exact: true }).click();
  await expect(dialog.getByText('1 项偏差', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '查看差异', exact: true }).click();
  await dialog.getByRole('button', { name: '应用标准并关联', exact: true }).click();
  await expect(dialog.getByText('符合标准', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page
      .locator('[data-testid="data-table"] tbody tr')
      .first()
      .locator('td[data-column-id="fieldType"]'),
  ).toHaveText('BIGINT');
});

test('Importing and adding a standard preserves unfinished field rows @fields', async ({
  page,
}) => {
  await page.goto('/');
  await setupHydratedState(page);
  const unfinished = page
    .locator('[data-testid="data-table"] tbody tr')
    .nth(1)
    .locator('td[data-column-id="fieldType"]');
  await unfinished.dblclick();
  await unfinished.locator('input').fill('VARCHAR(40)');
  await unfinished.locator('input').press('Enter');
  await page.getByRole('button', { name: '字段标准库', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'standards.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        standards: [
          {
            id: 'imported-standard',
            name: '金额',
            description: '订单金额',
            unit: '元',
            field: {
              fieldName: 'amount',
              fieldType: 'decimal(18,2)',
              fieldComment: '金额',
              nullable: false,
            },
          },
        ],
      }),
    ),
  });
  await expect(dialog.getByText(/将导入 1 个标准/)).toBeVisible();
  await dialog.getByRole('button', { name: '确认合并导入', exact: true }).click();
  await dialog.getByRole('button', { name: '金额 amount · decimal(18,2)', exact: true }).click();
  await dialog.getByRole('button', { name: '新增标准字段', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(
    page
      .locator('[data-testid="data-table"] td[data-column-id="fieldName"]')
      .filter({ hasText: /^amount$/ }),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-testid="data-table"] td[data-column-id="fieldType"]')
      .filter({ hasText: /^VARCHAR\(40\)$/ }),
  ).toBeVisible();
});
