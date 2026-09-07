import { openTableAction } from '../utils';
import { test, expect } from '@playwright/test';
import { setupHydratedState } from '../utils';

test.describe('SQL 导入功能验证 @tools', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/parse-sql', async (route) => {
      await route.fulfill({
        json: {
          result: {
            tableName: 'import_test',
            tableComment: '',
            fields: [
              {
                name: 'id',
                type: 'int',
                comment: '编号',
                nullable: true,
                defaultKind: 'none',
                defaultValue: '',
                onUpdate: 'none',
              },
              {
                name: 'name',
                type: 'varchar(50)',
                comment: '',
                nullable: true,
                defaultKind: 'none',
                defaultValue: '',
                onUpdate: 'none',
              },
            ],
            indexes: [],
            foreignKeys: [],
            authObjects: [],
          },
        },
      });
    });
    await page.goto('/');
    await setupHydratedState(page);
  });

  test('场景：导入建表 SQL 并回填 UI', async ({ page }) => {
    await page.getByRole('button', { name: /导入结构/i }).click();

    // 填写 SQL 到导入文本框
    const sqlInput = page.locator('#sql-content');
    await sqlInput.fill('CREATE TABLE import_test (id INT COMMENT "编号", name VARCHAR(50));');

    // 进入预览 -> 确认
    await page.getByRole('button', { name: /下一步/i }).click();
    await page.getByRole('button', { name: /下一步/i }).click();
    await page.getByRole('button', { name: /确认导入/i }).click();

    // 验证 UI 回填
    await expect(page.locator('#table-name')).toHaveValue('import_test');

    // 验证 HOT 中的字段
    const cell1 = page.locator('[data-testid="data-table"] tbody tr:nth-child(1) td:nth-child(2)');
    await expect(cell1).toHaveText('id');

    // 验证 SQL 生成面板同步更新
    const sqlOutput = page.locator('[role="tabpanel"]:visible pre');
    await expect(sqlOutput).toContainText(/CREATE TABLE import_test/i);
    await expect(sqlOutput).toContainText(/id\s+INT/i);
  });

  test('场景：PostgreSQL 大小写不同的字段独立维护索引', async ({ page }) => {
    await page.getByTestId('db-type-selector').click();
    await page.getByRole('option', { name: 'PostgreSQL', exact: true }).click();
    await expect(page.getByTestId('db-type-selector')).toContainText('PostgreSQL');
    await page.route('**/api/parse-sql', (route) =>
      route.fulfill({
        json: {
          result: {
            tableName: 'users',
            tableComment: '',
            authObjects: [],
            foreignKeys: [],
            fields: ['UserID', 'userid'].map((name) => ({
              name,
              type: 'INT',
              comment: '',
              nullable: false,
            })),
            indexes: ['UserID', 'userid'].map((name) => ({
              id: name,
              name: `idx_${name}`,
              fields: [{ name, direction: 'ASC' }],
              kind: 'unique_index',
            })),
          },
        },
      }),
    );
    await page.getByRole('button', { name: /导入结构/i }).click();
    await page.locator('#db-type').click();
    await page.getByRole('option', { name: 'PostgreSQL', exact: true }).click();
    await page.locator('#sql-content').fill('CREATE TABLE users ("UserID" INT, userid INT);');
    await page.getByRole('button', { name: /下一步/i }).click();
    await page.getByRole('button', { name: /下一步/i }).click();
    await page.getByRole('button', { name: /确认导入/i }).click();
    await expect(page.locator('#sql-content')).toBeHidden();
    await expect(page.getByTestId('db-type-selector')).toContainText('PostgreSQL');
    await expect(page.locator('[role="tabpanel"]:visible pre')).toContainText('"UserID" INTEGER');
    await page
      .locator('[data-testid="data-table"] tbody tr:first-child td:nth-child(2)')
      .dblclick();
    await page
      .locator('[data-testid="data-table"] input:not([aria-hidden="true"])')
      .fill('account_id');
    await page.keyboard.press('Enter');
    const sql = page.locator('[role="tabpanel"]:visible pre');
    await expect(sql).toContainText('CREATE UNIQUE INDEX idx_account_id ON users (account_id ASC)');
    await expect(sql).toContainText('CREATE UNIQUE INDEX idx_userid ON users (userid ASC)');
  });

  test('场景：编辑和清空主键字段名同步维护自引用外键', async ({ page }) => {
    await page.route('**/api/parse-sql', (route) =>
      route.fulfill({
        json: {
          result: {
            tableName: 'employees',
            tableComment: '',
            authObjects: [],
            fields: [
              { name: 'id', type: 'INT', comment: '', nullable: false },
              { name: 'manager_id', type: 'INT', comment: '', nullable: true },
            ],
            indexes: [
              {
                id: 'pk',
                name: 'pk_employees',
                fields: [{ name: 'id', direction: 'ASC' }],
                kind: 'primary',
              },
            ],
            foreignKeys: [
              {
                id: 'self',
                name: 'fk_manager',
                fields: ['manager_id'],
                refTable: 'employees',
                refFields: ['id'],
              },
            ],
          },
        },
      }),
    );
    await page.getByRole('button', { name: /导入结构/i }).click();
    await page
      .locator('#sql-content')
      .fill(
        'CREATE TABLE employees (id INT PRIMARY KEY, manager_id INT, CONSTRAINT fk_manager FOREIGN KEY (manager_id) REFERENCES employees (id));',
      );
    await page.getByRole('button', { name: /下一步/i }).click();
    await page.getByRole('button', { name: /下一步/i }).click();
    await page.getByRole('button', { name: /确认导入/i }).click();
    await expect(page.locator('#sql-content')).toBeHidden();
    const nameCell = page.locator(
      '[data-testid="data-table"] tbody tr:first-child td:nth-child(2)',
    );
    await nameCell.dblclick();
    await page
      .locator('[data-testid="data-table"] input:not([aria-hidden="true"])')
      .fill('employee_id');
    await page.keyboard.press('Enter');
    const sql = page.locator('[role="tabpanel"]:visible pre');
    await expect(sql).toContainText('PRIMARY KEY (employee_id ASC)');
    await expect(sql).toContainText('REFERENCES employees (employee_id)');
    await expect(sql).not.toContainText('REFERENCES employees (id)');
    await page.locator('#table-name').fill('staff');
    await expect(sql).toContainText('CREATE TABLE staff');
    await expect(sql).toContainText('REFERENCES staff (employee_id)');
    await expect(sql).not.toContainText('REFERENCES employees');

    await nameCell.dblclick();
    await nameCell.locator('input').fill('');
    await page.locator('#table-name').click();
    await expect(sql).not.toContainText('PRIMARY KEY');
    await expect(sql).not.toContainText('FOREIGN KEY');

    await nameCell.dblclick();
    await nameCell.locator('input').fill('staff_id');
    await page.keyboard.press('Enter');
    await expect(sql).toContainText(/staff_id\s+INT/);
    await expect(sql).not.toContainText('employee_id');
    await expect(sql).not.toContainText('REFERENCES staff');
  });

  test('场景：重新导入已有表不删除重建字段', async ({ page }) => {
    const importSql = async () => {
      await page.getByRole('button', { name: /导入结构/i }).click();
      await page
        .locator('#sql-content')
        .fill('CREATE TABLE import_test (id INT, name VARCHAR(50));');
      await page.getByRole('button', { name: /下一步/i }).click();
      await page.getByRole('button', { name: /下一步/i }).click();
      await page.getByRole('button', { name: /确认导入/i }).click();
      await expect(page.locator('#sql-content')).toBeHidden();
    };
    await importSql();
    await page.getByRole('button', { name: /保存当前表/i }).click();
    await page.getByLabel('保存名称').fill('import_test');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByLabel('保存名称')).toBeHidden();
    await importSql();
    await page.locator('#table-comment').fill('Only the comment changed');
    await openTableAction(page, /查看表结构变更/i);
    const output = page.getByRole('dialog', { name: '表结构变更对比' }).locator('pre').first();
    await expect(output).toContainText('Only the comment changed');
    await expect(output).not.toContainText('DROP COLUMN');
    await expect(output).not.toContainText('ADD COLUMN');
  });

  test('场景：导入索引名在增删索引和重命名表后保持不变', async ({ page }) => {
    await page.route('**/api/parse-sql', (route) =>
      route.fulfill({
        json: {
          result: {
            tableName: 'import_test',
            tableComment: '',
            authObjects: [],
            foreignKeys: [],
            fields: [
              { name: 'id', type: 'INT', comment: '', nullable: true },
              { name: 'name', type: 'VARCHAR(50)', comment: '', nullable: true },
            ],
            indexes: [
              {
                id: 'custom-index',
                name: 'customer_lookup',
                fields: [{ name: 'name', direction: 'ASC' }],
                kind: 'index',
              },
            ],
          },
        },
      }),
    );
    await page.getByRole('button', { name: /导入结构/i }).click();
    await page
      .locator('#sql-content')
      .fill(
        'CREATE TABLE import_test (id INT, name VARCHAR(50)); CREATE INDEX customer_lookup ON import_test(name);',
      );
    await page.getByRole('button', { name: /下一步/i }).click();
    await page.getByRole('button', { name: /下一步/i }).click();
    await page.getByRole('button', { name: /确认导入/i }).click();
    await expect(page.locator('#sql-content')).toBeHidden();
    await page.getByRole('tab', { name: /索引配置/ }).click();
    await page.getByRole('button', { name: '添加索引', exact: true }).click();
    const input = page.getByPlaceholder(/输入字段名进行匹配/);
    await input.fill('id');
    await expect(page.locator('[role="listbox"] [role="option"]').first()).toBeVisible();
    await input.press('ArrowDown');
    await input.press('Enter');
    await page.getByRole('button', { name: '保存索引', exact: true }).click();
    await expect(page.getByText('customer_lookup', { exact: true }).first()).toBeVisible();
    await page.locator('#table-name').fill('renamed_table');
    await expect(page.getByText('customer_lookup', { exact: true }).first()).toBeVisible();
    const card = page
      .getByText('idx_import_test_id', { exact: true })
      .first()
      .locator('xpath=ancestor::div[@role="button"]');
    await card.hover();
    await card.getByRole('button', { name: /删除索引/ }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: '删除索引', exact: true })
      .click();
    const sql = page.locator('[role="tabpanel"]:visible pre');
    await expect(sql).toContainText('CREATE TABLE renamed_table');
    await expect(sql).toContainText('INDEX customer_lookup (name ASC)');
    await expect(sql).not.toContainText('idx_import_test_id');
  });
});
