import { describe, expect, it } from 'vitest';
import { buildGenerateTableSystemPrompt } from '../prompts/generateTable.js';

describe('buildGenerateTableSystemPrompt', () => {
  it.each(['zh-CN', 'en-US', 'ja-JP'] as const)(
    'uses only the authoritative baseline for %s',
    (locale) => {
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
    },
  );

  it.each(['zh-CN', 'en-US', 'ja-JP'] as const)(
    'requires stable field identities for %s',
    (locale) => {
      const prompt = buildGenerateTableSystemPrompt({ dbType: 'mysql', locale, mode: 'patch' });
      expect(prompt).toContain('"id"');
      expect(prompt).toContain(
        locale === 'zh-CN' ? '重命名时也保持 id 不变' : 'including when renaming it',
      );
      expect(prompt).toContain(
        locale === 'zh-CN' ? '新增字段的 id 必须为 null' : 'New fields must use id: null',
      );
    },
  );

  it('日语请求应要求自然语言结果使用日语', () => {
    const prompt = buildGenerateTableSystemPrompt({
      dbType: 'mysql',
      locale: 'ja-JP',
    });

    expect(prompt).toContain('must be written in Japanese');
    expect(prompt).toContain('MYSQL');
  });

  it('constrains patch mode to the current user instruction', () => {
    const prompt = buildGenerateTableSystemPrompt({
      dbType: 'mysql',
      locale: 'zh-CN',
      mode: 'patch',
      existingConfig: {
        tableName: 'user_profile',
        rows: [{ fieldName: 'email', fieldType: 'VARCHAR', fieldComment: '邮箱' }],
        indexes: [
          { name: 'uk_email', fields: [{ name: 'email', direction: 'ASC' }], unique: true },
        ],
      },
    });

    expect(prompt).toContain('只执行用户本轮指令明确要求的表信息、字段、索引变化');
    expect(prompt).toContain('用户要求新增字段时，只追加用户要求的字段');
    expect(prompt).toContain('用户没有要求审查、评审、优化、规范化、全面调整、重构时');
    expect(prompt).toContain(
      '未被本轮指令覆盖的字段、字段类型、字段注释、可空、默认值、更新策略、主键、索引、表名、schema 和表注释必须逐值保留当前已有表配置',
    );
  });
});
