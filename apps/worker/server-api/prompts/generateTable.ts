import type { AppLocale } from '@ddlbuilder/shared-types/locale';
import type { ConversationMessage } from '@ddlbuilder/shared-types/ai-generate';

const BASE_SYSTEM_PROMPT_TEMPLATES: Record<Exclude<AppLocale, 'ja-JP'>, string> = {
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
      "id": "已有字段的原始 id；新增字段必须为 null",
      "fieldName": "字段名",
      "fieldType": "数据类型",
      "fieldComment": "字段注释",
      "nullable": true | false,
      "defaultKind": "none" | "auto_increment" | "constant" | "expression" | "current_timestamp" | "uuid",
      "defaultValue": "默认值（仅当 defaultKind 为 constant 或 expression 时填写）",
      "onUpdate": "none" | "current_timestamp",
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
5. 创建全新表时建议包含 created_at 和 updated_at 审计字段；修改现有表时按用户指令决定是否增删审计字段
6. schemaName 为可选字段，没有时返回空字符串或省略
7. designDecisions 应解释本次生成或修改涉及的关键建模决策
8. 只返回 JSON，不要有其他描述文字
9. 已有字段必须逐字复制当前配置或上一版结构中的 id，重命名时也保持 id 不变；新增字段的 id 必须为 null，禁止编造 id`,
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
      "id": "original ID for an existing field; null for a new field",
      "fieldName": "field name",
      "fieldType": "data type",
      "fieldComment": "field comment",
      "nullable": true | false,
      "defaultKind": "none" | "auto_increment" | "constant" | "expression" | "current_timestamp" | "uuid",
      "defaultValue": "default value (only when defaultKind is constant or expression)",
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
5. For a new table, prefer including created_at and updated_at audit fields. For an existing table edit, add or remove audit fields only when requested by the user.
6. schemaName is optional; return an empty string or omit it when not needed.
7. designDecisions should explain the key modeling decisions involved in this generation or edit.
8. Return JSON only, with no extra text.
9. Copy each existing field's id exactly from the current config or previous schema, including when renaming it. New fields must use id: null; never invent IDs.`,
};

const SYSTEM_PROMPT_TEMPLATES: Record<AppLocale, string> = {
  ...BASE_SYSTEM_PROMPT_TEMPLATES,
  'ja-JP': `${BASE_SYSTEM_PROMPT_TEMPLATES['en-US']}\nAll natural-language values in the response, including comments and design decisions, must be written in Japanese.`,
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

  const usePreviousSchema = mode !== 'patch' && !!previousSchema;
  const existingContext =
    existingConfig && !usePreviousSchema
      ? locale === 'zh-CN'
        ? `\n\n当前已有表配置（本轮唯一修改基线；历史对话中的提案可能未被应用）：\n${JSON.stringify(existingConfig, null, 2)}`
        : `\n\nCurrent table config (the only baseline for this revision; proposals in conversation history may not have been applied):\n${JSON.stringify(existingConfig, null, 2)}`
      : '';
  const patchContext =
    mode === 'patch'
      ? locale === 'zh-CN'
        ? `\n\n本次任务类型：对现有表做指令式修改。\n这些规则优先级高于通用建表建议：\n1. 以当前已有表配置作为完整基线，返回完整表结构 JSON\n2. 只执行用户本轮指令明确要求的表信息、字段、索引变化\n3. 当用户指令是明确动作，例如“增加 A、B 字段”“删除 A 字段”“把 A 改为 B”时，本轮只能产生这些点名对象的变更\n4. 用户要求新增字段时，只追加用户要求的字段；字段类型、可空、默认值和注释按用户给定信息与数据库语法补齐\n5. 用户要求删除字段时，只删除用户点名的字段\n6. 用户要求调整字段时，只调整用户点名字段的指定属性\n7. 用户要求调整索引时，只调整用户点名或直接相关的索引\n8. 用户没有明确要求修改某个已有字段时，禁止改变该字段的 fieldType、nullable、defaultKind、defaultValue、onUpdate、fieldComment、isPrimaryKey 或顺序\n9. 用户没有要求审查、评审、优化、规范化、全面调整、重构时，不输出额外的质量评审、字段批评、索引建议、命名建议、审计字段建议或全表改造\n10. 未被本轮指令覆盖的字段、字段类型、字段注释、可空、默认值、更新策略、主键、索引、表名、schema 和表注释必须逐值保留当前已有表配置；复制原值，不要做类型同义词转换、默认值补全、大小写归一、字段顺序整理\n11. designDecisions 只说明本轮实际执行的变更原因，避免对保留项做评价`
        : `\n\nTask type: instruction-based edit on an existing table.\nThese rules have higher priority than general table-design recommendations:\n1. Use the current table config as the complete baseline and return a full schema JSON.\n2. Apply only table-info, field, and index changes explicitly requested in the current user instruction.\n3. When the instruction is explicit, such as "add fields A and B", "remove field A", or "change A to B", this turn may produce changes only for those named objects.\n4. When the user asks to add fields, append only the requested fields; infer type, nullability, defaults, and comments from the user-provided details and database syntax.\n5. When the user asks to remove fields, remove only the named fields.\n6. When the user asks to update fields, update only the named properties of the named fields.\n7. When the user asks to update indexes, update only the named or directly related indexes.\n8. Unless the user explicitly asks to modify an existing field, do not change that field's fieldType, nullable, defaultKind, defaultValue, onUpdate, fieldComment, isPrimaryKey, or order.\n9. Unless the user asks for review, optimization, audit, normalization, comprehensive adjustment, or refactoring, do not output extra quality reviews, field criticism, index suggestions, naming suggestions, audit-field suggestions, or full-table redesigns.\n10. Fields, field types, comments, nullability, defaults, on-update rules, primary keys, indexes, table name, schema, and table comment outside the current instruction must keep the exact values from the current table config. Copy original values and do not apply type synonym conversion, default completion, case normalization, or field reordering.\n11. designDecisions should explain only the changes actually made in this turn and avoid evaluating preserved items.`
      : '';
  const previousSchemaContext = usePreviousSchema
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
