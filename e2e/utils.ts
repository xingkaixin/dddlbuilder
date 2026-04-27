import type { Page } from '@playwright/test';

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
