import type { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import OpenAI from 'openai';
import { enforceOpenAIRateLimit, withOpenAIRetry } from '../openaiControl.js';
import { errorResponse, streamErrorPayload } from '../lib/http.js';
import {
  buildGenerateTableMessages,
  buildGenerateTableSystemPrompt,
} from '../prompts/generateTable.js';

export function registerGenerateTableRoute(app: Hono) {
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

    const systemPrompt = buildGenerateTableSystemPrompt({
      dbType,
      templates,
      existingConfig,
    });

    const messages = buildGenerateTableMessages({
      systemPrompt,
      description,
      conversationHistory,
    });

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
}
