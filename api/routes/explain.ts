import type { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import OpenAI from 'openai';
import { enforceOpenAIRateLimit, withOpenAIRetry } from '../openaiControl.js';
import { errorResponse, streamErrorPayload } from '../lib/http.js';
import {
  EXPLAIN_SYSTEM_PROMPT,
  buildExplainUserPrompt,
} from '../prompts/explain.js';

export function registerExplainRoute(app: Hono) {
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

    const userPrompt = buildExplainUserPrompt(sql, context);

    return streamText(c, async (stream) => {
      try {
        const response = (await withOpenAIRetry(
          async () =>
            (await openai.chat.completions.create({
              model,
              messages: [
                { role: 'system', content: EXPLAIN_SYSTEM_PROMPT },
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
}
