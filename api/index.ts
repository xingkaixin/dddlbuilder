import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { streamText } from 'hono/streaming';
import OpenAI from 'openai';
import {
  enforceOpenAIRateLimit,
  withOpenAIRetry,
} from './openaiControl.js';
import type { DatabaseType } from '../src/types';

const app = new Hono().basePath('/api');
const MAX_SQL_LENGTH = 50_000;
const MAX_PARSE_SQL_BODY_BYTES = 131_072;
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

type ApiErrorCode =
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_JSON'
  | 'SQL_REQUIRED'
  | 'SQL_TOO_LONG'
  | 'INVALID_DATABASE_TYPE'
  | 'SQL_PARSE_FAILED'
  | 'OPENAI_API_KEY_MISSING'
  | 'EXPLAIN_FAILED'
  | 'REVIEW_FAILED'
  | 'GENERATION_FAILED'
  | 'DESCRIPTION_REQUIRED'
  | 'DDL_REQUIRED';

const parseAllowedOrigins = () => {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : DEFAULT_ALLOWED_ORIGINS;
};

const ALLOWED_CORS_ORIGINS = parseAllowedOrigins();

const errorResponse = (
  c: Context,
  status: number,
  error: string,
  code?: ApiErrorCode,
) => c.json(code ? { error, code } : { error }, status);

const streamErrorPayload = (error: string, code?: ApiErrorCode) =>
  JSON.stringify(code ? { error, code } : { error });

const parseJsonBodyWithLimit = async <T>(
  c: Context,
  maxBytes: number,
): Promise<{ data: T | null; errorResponse: Response | null }> => {
  const contentLength = Number(c.req.header('content-length'));
  if (!Number.isNaN(contentLength) && contentLength > maxBytes) {
    return {
      data: null,
      errorResponse: errorResponse(
        c,
        413,
        `Payload too large, maximum ${maxBytes} bytes`,
        'PAYLOAD_TOO_LARGE',
      ),
    };
  }

  let raw = '';
  try {
    raw = await c.req.text();
  } catch {
    return {
      data: null,
      errorResponse: errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON'),
    };
  }

  if (new TextEncoder().encode(raw).length > maxBytes) {
    return {
      data: null,
      errorResponse: errorResponse(
        c,
        413,
        `Payload too large, maximum ${maxBytes} bytes`,
        'PAYLOAD_TOO_LARGE',
      ),
    };
  }

  try {
    return { data: JSON.parse(raw) as T, errorResponse: null };
  } catch {
    return {
      data: null,
      errorResponse: errorResponse(c, 400, 'Invalid JSON body', 'INVALID_JSON'),
    };
  }
};

const SUPPORTED_DATABASE_TYPES = new Set<DatabaseType>([
  'mysql',
  'postgresql',
  'postgresql-citus',
  'sqlserver',
  'oracle',
  'mariadb',
  'tidb',
  'dm',
  'oceanbase',
  'oceanbase-oracle',
  'kingbase',
  'gbase',
  'polardb',
  'gaussdb',
]);

function isValidDatabaseType(value: unknown): value is DatabaseType {
  return (
    typeof value === 'string' &&
    SUPPORTED_DATABASE_TYPES.has(value as DatabaseType)
  );
}

app.use(
  '/*',
  cors({
    origin: ALLOWED_CORS_ORIGINS,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// SQL Parse endpoint
app.post('/parse-sql', async (c) => {
  const parsed = await parseJsonBodyWithLimit<{
    sql: unknown;
    dbType: unknown;
  }>(c, MAX_PARSE_SQL_BODY_BYTES);
  if (parsed.errorResponse) return parsed.errorResponse;

  const body = parsed.data || {};
  const { sql, dbType } = body;

  if (typeof sql !== 'string' || sql.trim().length === 0) {
    return errorResponse(c, 400, 'SQL is required', 'SQL_REQUIRED');
  }

  if (sql.length > MAX_SQL_LENGTH) {
    return errorResponse(
      c,
      400,
      `SQL too long, maximum ${MAX_SQL_LENGTH} characters`,
      'SQL_TOO_LONG',
    );
  }

  if (!isValidDatabaseType(dbType)) {
    return errorResponse(
      c,
      400,
      'Invalid database type',
      'INVALID_DATABASE_TYPE',
    );
  }

  try {
    const { SqlParser } = await import('../src/utils/SqlParser.js');
    const parser = new SqlParser();
    const result = await parser.parseAsync(sql, dbType);

    return c.json({ result });
  } catch (error) {
    console.error('[ParseSQL] Failed to parse SQL:', error);
    return errorResponse(c, 400, 'SQL parse failed', 'SQL_PARSE_FAILED');
  }
});

// DDL Explain endpoint
app.post('/explain', async (c) => {
  const rateLimitResponse = enforceOpenAIRateLimit(c, 'explain');
  if (rateLimitResponse) return rateLimitResponse;

  const { sql, context } = await c.req.json();
  console.log('[Explain] Request received:', {
    sqlLength: sql?.length,
    contextLength: context?.length,
  });

  if (!sql || sql.trim().length === 0) {
    return errorResponse(c, 400, 'SQL is required', 'SQL_REQUIRED');
  }

  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini';

  if (!apiKey) {
    return errorResponse(
      c,
      500,
      'OpenAI API key not configured',
      'OPENAI_API_KEY_MISSING',
    );
  }

  const openai = new OpenAI({
    baseURL,
    apiKey,
  });

  const systemPrompt = `你是一位资深的数据库专家。请简洁明了地解释用户提供的 SQL 片段的功能和关键点。如果提供了上下文，请结合上下文进行解释。
请直接返回解释文本，不要包含 Markdown 代码块。`;

  const userPrompt = `请解释以下 SQL 片段：
${sql}

${context ? `上下文相关 SQL：\n${context}` : ''}`;

  return streamText(c, async (stream) => {
    try {
      const response = (await withOpenAIRetry(
        async () =>
          (await openai.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 1000,
            stream: true,
            ...({
              thinking: {
                type: 'disabled',
              },
            } as any),
          })) as any,
        { scope: 'Explain' },
      )) as any;

      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          await stream.write(content);
        }
      }
    } catch (error) {
      console.error('[Explain] Streaming error:', error);
      await stream.write(
        streamErrorPayload('Explain failed', 'EXPLAIN_FAILED'),
      );
    }
  });
});

// DDL Review endpoint with streaming
app.post('/review', async (c) => {
  const rateLimitResponse = enforceOpenAIRateLimit(c, 'review');
  if (rateLimitResponse) return rateLimitResponse;

  const { ddl, tableName, dbType } = await c.req.json();
  console.log('[Review] Request received:', {
    tableName,
    dbType,
    ddlLength: ddl?.length,
  });

  if (!ddl || ddl.trim().length === 0) {
    return errorResponse(c, 400, 'DDL is required', 'DDL_REQUIRED');
  }

  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini';

  console.log('[Review] OpenAI config:', {
    baseURL,
    model,
    hasApiKey: !!apiKey,
  });

  if (!apiKey) {
    return errorResponse(
      c,
      500,
      'OpenAI API key not configured',
      'OPENAI_API_KEY_MISSING',
    );
  }

  const openai = new OpenAI({
    baseURL,
    apiKey,
  });

  const systemPrompt = `你是一位资深的数据库架构师和DDL评审专家。你的任务是评审用户提供的DDL语句，给出专业的评分和改进建议。

评审维度包括：
1. **命名规范性**：表名、字段名是否符合命名规范，是否使用数据库保留字
2. **数据类型选择**：类型是否与实际用途匹配（如用 VARCHAR 存日期、用 TEXT 存固定长度）
3. **索引设计**：是否缺少常用查询索引、索引是否冗余、索引字段顺序是否合理
4. **完整性约束**：主键、非空约束、默认值是否合理
5. **可扩展性**：是否缺少审计字段（created_at, updated_at）、版本控制字段
6. **性能考虑**：
   - 主键设计：大字段（TEXT/VARCHAR(500)以上）作为主键、复合主键字段过多
   - 索引效率：高频查询字段缺少索引
   - 字段设计：过多可 NULL 字段、超长 VARCHAR（如 VARCHAR(4000) 可能应该是 TEXT）

请以JSON格式返回评审结果：
{
  "score": 8,
  "summary": "简要评价，约50字以内",
  "suggestions": [
    {
      "id": "sug_1",
      "description": "建议描述",
      "type": "add_field" | "modify_field" | "remove_field" | "add_index" | "remove_index" | "performance_warning" | "general",
      "actionable": true,
      "field": { // 仅当 type 为 add_field 时提供
        "fieldName": "string",
        "fieldType": "string",
        "fieldComment": "string",
        "nullable": "是" | "否",
        "defaultKind": "无" | "自增" | "常量" | "当前时间" | "uuid",
        "defaultValue": "string",
        "onUpdate": "无" | "当前时间"
      },
      "fieldModification": { // 仅当 type 为 modify_field 时提供
        "fieldName": "string", // 目标字段名
        "changes": {
          "fieldType": "string",
          "fieldComment": "string",
          "nullable": "是" | "否",
          "defaultKind": "string",
          "defaultValue": "string",
          "onUpdate": "string"
        }
      },
      "fieldName": "string", // 仅当 type 为 remove_field 时提供，标识要移除的字段
      "index": { // 仅当 type 为 add_index 时提供
        "name": "string",
        "fields": [{ "name": "string", "direction": "ASC" | "DESC" }],
        "unique": boolean
      },
      "indexName": "string", // 仅当 type 为 remove_index 时提供，标识要移除的索引名
      "severity": "warning" | "error" // 仅当 type 为 performance_warning 时可选提供，标识问题严重程度
    }
  ]
}

注意：
1. actionable: 如果建议可以被程序自动执行，则为 true (如增/删/改字段或索引)；如果是性能警告 (performance_warning) 或笼统建议 (general)，则为 false。
2. performance_warning: 用于标识可能影响数据库性能的问题，如主键设计不当、类型选择不当等。这类建议可能需要用户自行判断是否修改。
3. 只返回 JSON，不要有其他描述文字。`;

  const userPrompt = `请评审以下${dbType.toUpperCase()}数据库的DDL语句：

表名: ${tableName || '未指定'}

DDL:
\`\`\`sql
${ddl}
\`\`\``;

  return streamText(c, async (stream) => {
    try {
      console.log('[Review] Calling OpenAI API with streaming...');
      const response = (await withOpenAIRetry(
        async () =>
          (await openai.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 2000,
            stream: true,
            ...({
              thinking: {
                type: 'disabled',
              },
            } as any),
          })) as any,
        { scope: 'Review' },
      )) as any;

      let fullContent = '';
      let chunkCount = 0;

      for await (const chunk of response) {
        chunkCount++;
        // Log raw chunk for debugging
        console.log(`[Review] Chunk ${chunkCount}:`, JSON.stringify(chunk));

        const delta = chunk.choices[0]?.delta;
        const content = delta?.content || '';
        const finishReason = chunk.choices[0]?.finish_reason;

        console.log(
          `[Review] Chunk ${chunkCount} - content: "${content}", finish_reason: ${finishReason}`,
        );

        if (content) {
          fullContent += content;
          await stream.write(content);
        }

        if (finishReason) {
          console.log(`[Review] Stream finished with reason: ${finishReason}`);
        }
      }

      console.log('[Review] Streaming complete');
      console.log('[Review] Total chunks:', chunkCount);
      console.log('[Review] Full content:', fullContent);
      console.log('[Review] Content length:', fullContent.length);
    } catch (error) {
      console.error('[Review] Streaming error:', error);
      // Log more details about the error
      if (error instanceof Error) {
        console.error('[Review] Error name:', error.name);
        console.error('[Review] Error message:', error.message);
        console.error('[Review] Error stack:', error.stack);
      }
      await stream.write(streamErrorPayload('Review failed', 'REVIEW_FAILED'));
    }
  });
});

// Natural Language Table Generation endpoint with streaming
app.post('/generate-table', async (c) => {
  const rateLimitResponse = enforceOpenAIRateLimit(c, 'generate-table');
  if (rateLimitResponse) return rateLimitResponse;

  const {
    description,
    dbType,
    templates,
    existingConfig,
    conversationHistory,
  } = await c.req.json();

  console.log('[GenerateTable] Request received:', {
    descriptionLength: description?.length,
    dbType,
    hasTemplates: !!templates?.length,
    hasExistingConfig: !!existingConfig,
    hasHistory: !!conversationHistory?.length,
  });

  if (!description || description.trim().length === 0) {
    return errorResponse(
      c,
      400,
      'Description is required',
      'DESCRIPTION_REQUIRED',
    );
  }

  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini';

  if (!apiKey) {
    return errorResponse(
      c,
      500,
      'OpenAI API key not configured',
      'OPENAI_API_KEY_MISSING',
    );
  }

  const openai = new OpenAI({
    baseURL,
    apiKey,
  });

  // Build template context if provided
  const templateContext = templates?.length
    ? `\n\n用户定义的字段模板（优先参考）：
${JSON.stringify(templates, null, 2)}`
    : '';

  // Build existing config context if provided
  const existingContext = existingConfig
    ? `\n\n当前已有表配置（用户可能希望基于此修改）：
${JSON.stringify(existingConfig, null, 2)}`
    : '';

  const systemPrompt = `你是一位资深的数据库架构师。根据用户的自然语言描述，生成符合 ${dbType.toUpperCase()} 数据库规范的表结构。
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

  // Build messages array with conversation history
  const messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }> = [{ role: 'system', content: systemPrompt }];

  // Add conversation history if provided
  if (conversationHistory?.length) {
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }
  }

  // Add current user message
  messages.push({ role: 'user', content: description });

  return streamText(c, async (stream) => {
    try {
      console.log('[GenerateTable] Calling OpenAI API with streaming...');
      const response = (await withOpenAIRetry(
        async () =>
          (await openai.chat.completions.create({
            model,
            messages,
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 4000,
            stream: true,
            ...({
              thinking: {
                type: 'disabled',
              },
            } as any),
          })) as any,
        { scope: 'GenerateTable' },
      )) as any;

      let fullContent = '';

      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          await stream.write(content);
        }
      }

      console.log('[GenerateTable] Streaming complete');
      console.log('[GenerateTable] Full content length:', fullContent.length);
    } catch (error) {
      console.error('[GenerateTable] Streaming error:', error);
      await stream.write(
        streamErrorPayload('Generation failed', 'GENERATION_FAILED'),
      );
    }
  });
});

export default app;
