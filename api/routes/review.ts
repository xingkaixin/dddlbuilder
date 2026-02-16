import type { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import OpenAI from 'openai';
import { enforceOpenAIRateLimit, withOpenAIRetry } from '../openaiControl.js';
import { errorResponse, streamErrorPayload } from '../lib/http.js';
import {
  REVIEW_SYSTEM_PROMPT,
  buildReviewUserPrompt,
} from '../prompts/review.js';

export function registerReviewRoute(app: Hono) {
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

    const userPrompt = buildReviewUserPrompt(ddl, tableName, dbType);

    return streamText(c, async (stream) => {
      try {
        console.log('[Review] Calling OpenAI API with streaming...');
        const response = (await withOpenAIRetry(
          async () =>
            (await openai.chat.completions.create({
              model,
              messages: [
                { role: 'system', content: REVIEW_SYSTEM_PROMPT },
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
            console.log(
              `[Review] Stream finished with reason: ${finishReason}`,
            );
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
          streamErrorPayload('Review failed', 'REVIEW_FAILED'),
        );
      }
    });
  });
}
