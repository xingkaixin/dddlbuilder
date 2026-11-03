import * as aiTransport from '@/services/aiConversationService';

// oxlint-disable-next-line anti-slop/no-module-mocking -- Transport lifecycle has dedicated integration tests; these tests protect scenario decoding and hook state.
vi.mock('@/services/aiConversationService', () => ({ fetchAIConversation: vi.fn() }));

import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestDDLReview } from '@/services/reviewService';
import { createAITextStream as createTextStream } from '@/__tests__/utils/aiStream';

describe('requestDDLReview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a streamed service error instead of producing a default review', async () => {
    vi.spyOn(aiTransport, 'fetchAIConversation').mockResolvedValue(
      new Response('{"type":"error","error":"upstream failed","code":"UPSTREAM_OPENAI_ERROR"}\n'),
    );
    await expect(
      requestDDLReview(
        { ddl: 'ddl', tableName: 'users', dbType: 'mysql' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('AI');
  });

  it('downgrades malformed actionable suggestions at the service boundary', async () => {
    // SAFETY: this malformed-suggestion fixture implements the response stream consumed by requestDDLReview.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the fixture implements only the fetch response members used by the service.
    vi.spyOn(aiTransport, 'fetchAIConversation').mockResolvedValue({
      ok: true,
      headers: new Headers(),
      status: 200,
      body: createTextStream([
        JSON.stringify({
          score: 8,
          summary: 'ok',
          suggestions: [
            {
              id: 'broken-modify',
              type: 'modify_field',
              description: 'modify status',
              actionable: true,
              fieldModification: { fieldName: 'status' },
            },
          ],
        }),
      ]),
    } as unknown as Response);

    const result = await requestDDLReview(
      { ddl: 'ddl', tableName: 'users', dbType: 'mysql' },
      { signal: new AbortController().signal },
    );

    expect(result.suggestions).toEqual([
      {
        id: 'broken-modify',
        type: 'general',
        description: 'modify status',
        actionable: false,
      },
    ]);
  });
});
