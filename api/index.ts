import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamText } from 'hono/streaming';
import OpenAI from 'openai';

const app = new Hono().basePath('/api');

// Enable CORS for local development
app.use('/*', cors());

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// DDL Review endpoint with streaming
app.post('/review', async (c) => {
  const { ddl, tableName, dbType } = await c.req.json();
  console.log('[Review] Request received:', {
    tableName,
    dbType,
    ddlLength: ddl?.length,
  });

  if (!ddl || ddl.trim().length === 0) {
    return c.json({ error: 'DDL is required' }, 400);
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
    return c.json({ error: 'OpenAI API key not configured' }, 500);
  }

  const openai = new OpenAI({
    baseURL,
    apiKey,
  });

  const systemPrompt = `你是一位资深的数据库架构师和DDL评审专家。你的任务是评审用户提供的DDL语句，给出专业的评分和建议。

评审维度包括：
1. 命名规范性（表名、字段名是否符合规范）
2. 数据类型选择（是否合理、是否有更优选择）
3. 索引设计（是否合理、是否缺少必要索引）
4. 完整性约束（主键、外键、唯一约束等）
5. 可扩展性（是否考虑未来扩展）
6. 性能考虑（是否有潜在性能问题）

请以JSON格式返回评审结果：
{
  "score": 8,
  "summary": "简要评价，约50字以内",
  "suggestions": ["建议1", "建议2", "建议3"]
}

只返回JSON，不要有其他内容。`;

  const userPrompt = `请评审以下${dbType.toUpperCase()}数据库的DDL语句：

表名: ${tableName || '未指定'}

DDL:
\`\`\`sql
${ddl}
\`\`\``;

  return streamText(c, async (stream) => {
    try {
      console.log('[Review] Calling OpenAI API with streaming...');
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2000,
        stream: true,
        thinking: {
          type: 'disabled',
        },
      });

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
      await stream.write(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Review failed',
        }),
      );
    }
  });
});

export default app;
