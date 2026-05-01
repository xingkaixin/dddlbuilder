import type { AppLocale } from '@ddlbuilder/shared-types/locale';
import type { ConversationMessage } from '@ddlbuilder/shared-types/ai-generate';

const SYSTEM_PROMPT_TEMPLATES: Record<AppLocale, string> = {
  'zh-CN': `你是一位资深的数据库架构师。根据用户的自然语言描述，生成符合 {{DB}} 数据库规范的表结构。
{{TEMPLATE_CONTEXT}}{{EXISTING_CONTEXT}}{{PATCH_CONTEXT}}
{{PREVIOUS_SCHEMA_CONTEXT}}

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
  ],
  "designDecisions": [
    {
      "title": "设计点标题",
      "rationale": "说明该字段组、主键或索引为什么这样设计"
    }
  ]
}

注意：
1. 如果有“当前已有表配置”或“上一版表结构”，必须以它作为基线，按用户本轮要求做增量调整，保留未被要求调整的表名、表注释、字段、字段类型、字段注释、默认值和索引
2. 如果用户提供了字段模板或整表蓝本，优先使用其中的字段、索引和结构约束
3. 字段类型应符合 {{DB}} 数据库语法
4. 主键字段的 isPrimaryKey 设为 true
5. 建议包含 created_at 和 updated_at 审计字段
6. schemaName 为可选字段，没有时返回空字符串或省略
7. designDecisions 应解释关键建模决策和相对上一版的变更原因，例如新增字段、删除字段、字段类型调整、字段命名调整和索引调整
8. 只返回 JSON，不要有其他描述文字`,
  'en-US': `You are a senior database architect. Generate a table schema that follows {{DB}} syntax based on the user's natural-language request.
{{TEMPLATE_CONTEXT}}{{EXISTING_CONTEXT}}{{PATCH_CONTEXT}}
{{PREVIOUS_SCHEMA_CONTEXT}}

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
  ],
  "designDecisions": [
    {
      "title": "decision title",
      "rationale": "explain why this field group, primary key, or index is designed this way"
    }
  ]
}

Notes:
1. If current table config or a previous schema is provided, use it as the baseline and revise it incrementally according to the user's current request, preserving table names, comments, fields, field types, defaults, and indexes that the user did not ask to change.
2. If field templates or table blueprints are provided, prioritize their fields, indexes, and structural constraints.
3. Field types must be valid for {{DB}}.
4. Set isPrimaryKey=true for primary-key fields.
5. Prefer including created_at and updated_at audit fields.
6. schemaName is optional; return an empty string or omit it when not needed.
7. designDecisions should explain key modeling choices and changes from the previous schema, such as added fields, removed fields, type changes, renames, and index changes.
8. Return JSON only, with no extra text.`,
};

export const buildGenerateTableSystemPrompt = (params: {
  dbType: string;
  locale: AppLocale;
  mode?: 'generate' | 'patch';
  templates?: unknown[];
  existingConfig?: unknown;
  previousSchema?: unknown;
}) => {
  const { dbType, locale, mode = 'generate', templates, existingConfig, previousSchema } = params;

  const templateContext = templates?.length
    ? locale === 'zh-CN'
      ? `\n\n用户定义的模板和整表蓝本（优先参考）：\n${JSON.stringify(templates, null, 2)}`
      : `\n\nUser-defined templates and table blueprints (high priority):\n${JSON.stringify(templates, null, 2)}`
    : '';

  const existingContext = existingConfig
    ? locale === 'zh-CN'
      ? `\n\n当前已有表配置（用户可能希望基于此修改）：\n${JSON.stringify(existingConfig, null, 2)}`
      : `\n\nCurrent table config (the user may want to modify based on this):\n${JSON.stringify(existingConfig, null, 2)}`
    : '';
  const patchContext =
    mode === 'patch'
      ? locale === 'zh-CN'
        ? `\n\n本次任务类型：对现有表做指令式修改。\n执行规则：\n1. 只处理用户本轮指令明确提到的表说明、字段、索引变化\n2. 未被用户提到的字段、字段类型、字段注释、可空、默认值、更新策略、索引必须逐值保留当前已有表配置\n3. 用户要求新增字段时，返回完整表结构时只追加这些字段，并保持已有字段和索引原值\n4. 只有当用户明确要求“审查”、“优化”、“评审”或“全面调整”时，才输出全表优化调整\n5. designDecisions 只解释本轮指令对应的变更`
        : `\n\nTask type: instruction-based edit on an existing table.\nRules:\n1. Only apply table-info, field, and index changes explicitly requested in the current user instruction.\n2. Fields, field types, comments, nullability, defaults, on-update rules, and indexes not mentioned by the user must keep the exact values from the current table config.\n3. When the user asks to add fields, return the full schema with only those fields appended and keep existing fields and indexes unchanged.\n4. Full-table optimization changes are allowed only when the user explicitly asks for review, optimization, or comprehensive adjustment.\n5. designDecisions should explain only the changes requested in this turn.`
      : '';
  const previousSchemaContext = previousSchema
    ? locale === 'zh-CN'
      ? `\n\n上一版表结构（本轮修改的基线，按用户要求做增量变更）：\n${JSON.stringify(previousSchema, null, 2)}`
      : `\n\nPrevious schema (baseline for this revision; apply the user's requested changes incrementally):\n${JSON.stringify(previousSchema, null, 2)}`
    : '';

  return SYSTEM_PROMPT_TEMPLATES[locale]
    .replaceAll('{{DB}}', dbType.toUpperCase())
    .replace('{{TEMPLATE_CONTEXT}}', templateContext)
    .replace('{{EXISTING_CONTEXT}}', existingContext)
    .replace('{{PATCH_CONTEXT}}', patchContext)
    .replace('{{PREVIOUS_SCHEMA_CONTEXT}}', previousSchemaContext);
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
