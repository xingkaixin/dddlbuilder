import type { AppLocale } from '@ddlbuilder/shared-types/locale';

export const EXPLAIN_SYSTEM_PROMPT: Record<AppLocale, string> = {
  'zh-CN': `你是一位资深的数据库专家。请简洁明了地解释用户提供的 SQL 片段的功能和关键点。如果提供了上下文，请结合上下文进行解释。
请直接返回解释文本，不要包含 Markdown 代码块。`,
  'en-US': `You are a senior database expert. Explain the functionality and key points of the SQL snippet clearly and concisely. If context is provided, include it in your explanation.
Return plain explanation text only, without Markdown code blocks.`,
  'ja-JP': `You are a senior database expert. Explain the functionality and key points of the SQL snippet clearly and concisely in Japanese. If context is provided, include it in your explanation.
Return plain Japanese explanation text only, without Markdown code blocks.`,
};

export const buildExplainUserPrompt = (
  sql: string,
  context: string | undefined,
  locale: AppLocale,
) => {
  if (locale !== 'zh-CN') {
    return `Explain the following SQL snippet:\n${sql}\n\n${context ? `Related SQL context:\n${context}` : ''}`;
  }

  return `请解释以下 SQL 片段：\n${sql}\n\n${context ? `上下文相关 SQL：\n${context}` : ''}`;
};
