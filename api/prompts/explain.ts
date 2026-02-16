export const EXPLAIN_SYSTEM_PROMPT = `你是一位资深的数据库专家。请简洁明了地解释用户提供的 SQL 片段的功能和关键点。如果提供了上下文，请结合上下文进行解释。
请直接返回解释文本，不要包含 Markdown 代码块。`;

export const buildExplainUserPrompt = (
  sql: string,
  context?: string,
) => `请解释以下 SQL 片段：
${sql}

${context ? `上下文相关 SQL：\n${context}` : ''}`;
