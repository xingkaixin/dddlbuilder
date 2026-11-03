import { describe, expect, it } from 'vitest';
import { buildGenerateTableSystemPrompt } from '../prompts/generateTable.js';

describe('buildGenerateTableSystemPrompt', () => {
  it.each(['zh-CN', 'en-US'] as const)('uses only the authoritative baseline for %s', (locale) => {
    const contexts = {
      dbType: 'mysql',
      locale,
      existingConfig: { tableName: 'current_editor_table' },
      previousSchema: { tableName: 'unapplied_proposal' },
    } satisfies Omit<Parameters<typeof buildGenerateTableSystemPrompt>[0], 'mode'>;
    const patch = buildGenerateTableSystemPrompt({ ...contexts, mode: 'patch' });
    expect(patch).toContain('current_editor_table');
    expect(patch).not.toContain('unapplied_proposal');
    expect(patch).toContain(
      locale === 'zh-CN'
        ? '历史对话中的提案可能未被应用'
        : 'proposals in conversation history may not have been applied',
    );
    const generate = buildGenerateTableSystemPrompt({ ...contexts, mode: 'generate' });
    expect(generate).toContain('unapplied_proposal');
    expect(generate).not.toContain('current_editor_table');
  });

  it.each(['zh-CN', 'en-US'] as const)('requires stable field identities for %s', (locale) => {
    const prompt = buildGenerateTableSystemPrompt({ dbType: 'mysql', locale, mode: 'patch' });
    expect(prompt).toContain('"id"');
    expect(prompt).toContain(
      locale === 'zh-CN' ? '重命名时也保持 id 不变' : 'including when renaming it',
    );
    expect(prompt).toContain(
      locale === 'zh-CN' ? '新增字段的 id 必须为 null' : 'New fields must use id: null',
    );
  });
});
