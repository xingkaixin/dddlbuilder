import type { AppLocale } from '@ddlbuilder/shared-types/locale';
import type { ConversationMessage } from '@ddlbuilder/shared-types/ai-generate';

const SYSTEM_PROMPT_TEMPLATES: Record<AppLocale, string> = {
  'zh-CN': `你是一位资深的数据库架构师。根据用户的自然语言描述，生成符合 {{DB}} 数据库规范的表结构。
{{TEMPLATE_CONTEXT}}{{EXISTING_CONTEXT}}

请以 JSON 格式返回，格式如下：
{
  "schemaName": "schema 名（可选，不需要时留空）",
  "tableName": "表名（英文，下划线命名）",
  "tableComment": "表注释（中文）",
  "fields": [
    {
      "fieldName": "字段名",
      "fieldType": "数据类型",
      "fieldComment": "字段注释",
      "nullable": "是" | "否",
      "defaultKind": "无" | "自增" | "常量" | "当前时间" | "uuid",
      "defaultValue": "默认值（仅当 defaultKind 为常量时填写）",
      "onUpdate": "无" | "当前时间",
      "isPrimaryKey": true | false
    }
  ],
  "indexes": [
    {
      "name": "索引名",
      "fields": [{ "name": "字段名", "direction": "ASC" | "DESC" }],
      "unique": true | false
    }
  ]
}

注意：
1. 如果用户提供了字段模板，优先使用模板中的字段定义
2. 字段类型应符合 {{DB}} 数据库语法
3. 主键字段的 isPrimaryKey 设为 true
4. 建议包含 created_at 和 updated_at 审计字段
5. schemaName 为可选字段，没有时返回空字符串或省略
6. 只返回 JSON，不要有其他描述文字`,
  'en-US': `You are a senior database architect. Generate a table schema that follows {{DB}} syntax based on the user's natural-language request.
{{TEMPLATE_CONTEXT}}{{EXISTING_CONTEXT}}

Return JSON only, in this format:
{
  "schemaName": "optional schema name",
  "tableName": "snake_case table name",
  "tableComment": "table comment",
  "fields": [
    {
      "fieldName": "field name",
      "fieldType": "data type",
      "fieldComment": "field comment",
      "nullable": "yes" | "no",
      "defaultKind": "none" | "auto_increment" | "constant" | "current_timestamp" | "uuid",
      "defaultValue": "default value (only when defaultKind is constant)",
      "onUpdate": "none" | "current_timestamp",
      "isPrimaryKey": true | false
    }
  ],
  "indexes": [
    {
      "name": "index name",
      "fields": [{ "name": "field name", "direction": "ASC" | "DESC" }],
      "unique": true | false
    }
  ]
}

Notes:
1. If field templates are provided, prioritize those definitions.
2. Field types must be valid for {{DB}}.
3. Set isPrimaryKey=true for primary-key fields.
4. Prefer including created_at and updated_at audit fields.
5. schemaName is optional; return an empty string or omit it when not needed.
6. Return JSON only, with no extra text.`,
};

export const buildGenerateTableSystemPrompt = (params: {
  dbType: string;
  locale: AppLocale;
  templates?: unknown[];
  existingConfig?: unknown;
}) => {
  const { dbType, locale, templates, existingConfig } = params;

  const templateContext = templates?.length
    ? locale === 'zh-CN'
      ? `\n\n用户定义的字段模板（优先参考）：\n${JSON.stringify(templates, null, 2)}`
      : `\n\nUser-defined field templates (high priority):\n${JSON.stringify(templates, null, 2)}`
    : '';

  const existingContext = existingConfig
    ? locale === 'zh-CN'
      ? `\n\n当前已有表配置（用户可能希望基于此修改）：\n${JSON.stringify(existingConfig, null, 2)}`
      : `\n\nCurrent table config (the user may want to modify based on this):\n${JSON.stringify(existingConfig, null, 2)}`
    : '';

  return SYSTEM_PROMPT_TEMPLATES[locale]
    .replaceAll('{{DB}}', dbType.toUpperCase())
    .replace('{{TEMPLATE_CONTEXT}}', templateContext)
    .replace('{{EXISTING_CONTEXT}}', existingContext);
};

export const buildGenerateTableMessages = (params: {
  systemPrompt: string;
  description: string;
  conversationHistory?: ConversationMessage[];
}) => {
  const { systemPrompt, description, conversationHistory } = params;

  const messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }> = [{ role: 'system', content: systemPrompt }];

  if (conversationHistory?.length) {
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  messages.push({ role: 'user', content: description });

  return messages;
};
