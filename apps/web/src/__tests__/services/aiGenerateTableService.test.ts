import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestGenerateTable } from '@/services/aiGenerateTableService';
import { createAITextStream as createTextStream } from '@/__tests__/utils/aiStream';

describe('requestGenerateTable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a streamed error instead of returning an empty schema', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"type":"error","error":"upstream failed","code":"UPSTREAM_OPENAI_ERROR"}\n'),
    );
    await expect(
      requestGenerateTable(
        { description: '生成用户表', dbType: 'mysql' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('AI');
  });

  it('should parse final generated schema and stream updates', async () => {
    const updates: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      body: createTextStream([
        '{"tableName":"users","tableComment":"u",',
        '"fields":[],"indexes":[],"designDecisions":[{"title":"主键策略","rationale":"稳定标识"}]}',
      ]),
      json: vi.fn(),
    } as unknown as Response);

    const result = await requestGenerateTable(
      {
        description: '生成用户表',
        dbType: 'mysql',
      },
      {
        signal: new AbortController().signal,
        onStreamingText: (text) => updates.push(text),
      },
    );

    expect(result.result.tableName).toBe('users');
    expect(result.result.fields).toEqual([]);
    expect(result.result.designDecisions?.[0]?.title).toBe('主键策略');
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[updates.length - 1]).toBe(result.fullText);
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
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

  it('should throw non-ok response error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: '生成失败' }),
    } as unknown as Response);

    await expect(
      requestGenerateTable(
        {
          description: '生成用户表',
          dbType: 'mysql',
        },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('生成失败');
  });
});
