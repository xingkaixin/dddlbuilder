import { setSchemaName } from '../utils';
import { test, expect } from '@playwright/test';
import { setupHydratedState } from '../utils';

test('ORM output keeps schemas separate from type names @core', async ({ page }) => {
  await page.goto('/');
  await setupHydratedState(page);
  await page.getByTestId('db-type-selector').click();
  await page.getByRole('option', { name: 'PostgreSQL', exact: true }).click();
  await setSchemaName(page, 'public');
  await page.locator('#table-name').fill('user_profile');
  await page.getByRole('tab', { name: 'ORM 模型', exact: true }).click();

  const output = page.getByRole('tabpanel', { name: 'ORM 模型' }).locator('pre');
  await expect(output).toContainText('model UserProfile {');
  await expect(output).toContainText('@@map("user_profile")');
  await expect(output).toContainText('@@schema("public")');

  await page.locator('#orm-target').click();
  await page.getByRole('option', { name: 'TypeORM', exact: true }).click();
  await expect(output).toContainText('export class UserProfile {');
  await expect(output).toContainText('@Entity({ name: "user_profile", schema: "public" })');

  await setSchemaName(page, 'audit');
  await expect(output).toContainText('schema: "audit"');
  await expect(output).not.toContainText('schema: "public"');
});
