export type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export const buildGenerateTableSystemPrompt = (params: {
  dbType: string;
  templates?: unknown[];
  existingConfig?: unknown;
}) => {
  const { dbType, templates, existingConfig } = params;

  const templateContext = templates?.length
    ? `\n\n用户定义的字段模板（优先参考）：
${JSON.stringify(templates, null, 2)}`
    : '';

  const existingContext = existingConfig
    ? `\n\n当前已有表配置（用户可能希望基于此修改）：
${JSON.stringify(existingConfig, null, 2)}`
    : '';

  return `你是一位资深的数据库架构师。根据用户的自然语言描述，生成符合 ${dbType.toUpperCase()} 数据库规范的表结构。
${templateContext}
${existingContext}

请以 JSON 格式返回，格式如下：
{
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
2. 字段类型应符合 ${dbType.toUpperCase()} 数据库语法
3. 主键字段的 isPrimaryKey 设为 true
4. 建议包含 created_at 和 updated_at 审计字段
5. 只返回 JSON，不要有其他描述文字`;
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
