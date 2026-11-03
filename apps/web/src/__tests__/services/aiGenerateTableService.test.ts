import * as aiTransport from '@/services/aiConversationService';

// oxlint-disable-next-line anti-slop/no-module-mocking -- Transport lifecycle has dedicated integration tests; these tests protect scenario decoding and hook state.
vi.mock('@/services/aiConversationService', () => ({ fetchAIConversation: vi.fn() }));

import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestGenerateTable } from '@/services/aiGenerateTableService';
import { createAITextStream as createTextStream } from '@/__tests__/utils/aiStream';

describe('requestGenerateTable', () => {
  it.each([
    { tableName: 'users', tableComment: '', fields: [{ fieldName: 'id' }] },
    {
      tableName: 'users',
      tableComment: '',
      fields: [],
      indexes: [{ name: 'idx', fields: [null], unique: true }],
    },
  ])(
    'rejects malformed completed schemas instead of accepting a partial result: %j',
    async (schema) => {
      vi.spyOn(aiTransport, 'fetchAIConversation').mockResolvedValue(
        new Response(createTextStream([JSON.stringify(schema)])),
      );
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(
        requestGenerateTable(
          { description: '生成用户表', dbType: 'mysql' },
          { signal: new AbortController().signal },
        ),
      ).rejects.toThrow('解析响应失败');
    },
  );

  it('uses current fields after a previous patch proposal was not applied', async () => {
    const fields = ['a', 'b'].map((id) => ({
      id,
      fieldName: id,
      fieldType: 'int',
      fieldComment: '',
      nullable: true,
      defaultKind: 'none' as const,
    }));
    const previousSchema = {
      tableName: 'users',
      tableComment: '',
      fields: [fields[0]],
      indexes: [],
    };
    const fetchMock = vi.spyOn(aiTransport, 'fetchAIConversation').mockResolvedValue(
      new Response(
        createTextStream([
          JSON.stringify({
            ...previousSchema,
            fields: [...fields, { ...fields[0], id: null, fieldName: 'c' }],
          }),
        ]),
      ),
    );
    const response = await requestGenerateTable(
      {
        description: '新增 c，保留当前 a、b',
        dbType: 'mysql',
        options: { mode: 'patch', existingConfig: { rows: fields }, previousSchema },
      },
      { signal: new AbortController().signal },
    );
    expect(response.result.fields.map((field) => field.fieldName)).toEqual(['a', 'b', 'c']);
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.previousSchema).toBeUndefined();
    expect(request.existingConfig.rows).toEqual(fields);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a streamed error instead of returning an empty schema', async () => {
    vi.spyOn(aiTransport, 'fetchAIConversation').mockResolvedValue(
      new Response('{"type":"error","error":"upstream failed","code":"UPSTREAM_OPENAI_ERROR"}\n'),
    );
    await expect(
      requestGenerateTable(
        { description: '生成用户表', dbType: 'mysql' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('AI');
  });

  it('uses the request baseline to preserve a renamed field through the stream', async () => {
    const field = {
      id: 'phone-id',
      fieldName: 'phone',
      fieldType: 'int',
      fieldComment: '',
      nullable: true,
      defaultKind: 'none' as const,
    };
    vi.spyOn(aiTransport, 'fetchAIConversation').mockResolvedValue(
      new Response(
        createTextStream([
          JSON.stringify({
            tableName: 'users',
            tableComment: '',
            fields: [{ ...field, fieldName: 'mobile' }],
          }),
        ]),
      ),
    );

    const response = await requestGenerateTable(
      {
        description: '重命名 phone',
        dbType: 'mysql',
        options: { mode: 'patch', existingConfig: { rows: [field] } },
      },
      { signal: new AbortController().signal },
    );
    expect(response.result.fields[0]).toMatchObject({ id: 'phone-id', fieldName: 'mobile' });
  });
});
