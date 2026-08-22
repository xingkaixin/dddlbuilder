import type { AICommentRequest } from '@ddlbuilder/shared-types/ai-generate';

const TARGET_LANGUAGE: Record<AICommentRequest['targetLocale'], string> = {
  'zh-CN': '中文',
  'en-US': 'English',
  'ja-JP': '日本語',
};

export const GENERATE_COMMENTS_SYSTEM_PROMPT = `你是一位数据库建模专家，负责为表和字段生成准确、简洁的业务注释。

输出规则：
1. 只返回 JSON，不要输出 Markdown 或解释。
2. JSON 结构必须是 {"tableComment":"string","fields":[{"fieldName":"string","fieldComment":"string"}]}。
3. fields 必须覆盖输入中的全部字段，fieldName 必须与输入完全一致。
4. 注释必须使用目标语言，表达字段的业务含义。
5. 注释保持短句，不包含字段名、类型名、引号和标点装饰。
6. 根据表名、表注释、字段名、字段类型和已有字段注释推断上下文。`;

export function buildGenerateCommentsUserPrompt(request: AICommentRequest) {
  const language = TARGET_LANGUAGE[request.targetLocale];
  const action =
    request.mode === 'translate'
      ? '将表注释和所有字段注释批量翻译为目标语言；缺失注释的项目根据上下文补全。'
      : '为缺失注释的表和字段补全目标语言注释；已有注释原样返回。';

  return JSON.stringify({
    action,
    targetLanguage: language,
    schemaName: request.schemaName ?? '',
    tableName: request.tableName,
    tableComment: request.tableComment,
    fields: request.fields,
  });
}
