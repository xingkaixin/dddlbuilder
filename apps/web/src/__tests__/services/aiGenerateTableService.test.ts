import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestGenerateTable } from '@/services/aiGenerateTableService';
import { createAITextStream as createTextStream } from '@/__tests__/utils/aiStream';

describe('requestGenerateTable', () => {
  it('resolves legacy field identities using the requested dialect', async () => {
    const rows = ['UserID', 'userid'].map((fieldName) => ({
      id: fieldName,
      fieldName,
      fieldType: 'int',
      fieldComment: '',
      nullable: true,
      defaultKind: 'none' as const,
    }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        createTextStream([
          JSON.stringify({
            tableName: 'users',
            tableComment: '',
            fields: rows.map(({ id: _id, ...row }) => row),
          }),
        ]),
      ),
    );
    const response = await requestGenerateTable(
      {
        description: '保留字段',
        dbType: 'postgresql',
        options: { mode: 'patch', existingConfig: { rows } },
      },
      { signal: new AbortController().signal },
    );
    expect(response.result.fields.map((field) => field.id)).toEqual(['UserID', 'userid']);
  });

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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
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

  it('rejects an identity that exists only in an unapplied patch proposal', async () => {
    const stale = {
      id: 'stale',
      fieldName: 'stale',
      fieldType: 'int',
      fieldComment: '',
      nullable: true,
      defaultKind: 'none' as const,
    };
    const schema = { tableName: 'users', tableComment: '', fields: [stale], indexes: [] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(createTextStream([JSON.stringify(schema)])),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      requestGenerateTable(
        {
          description: '修改当前表',
          dbType: 'mysql',
          options: { mode: 'patch', existingConfig: { rows: [] }, previousSchema: schema },
        },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('解析响应失败');
  });

  it('continues generated designs from the previous proposal instead of the editor', async () => {
    const field = {
      id: 'proposal',
      fieldName: 'id',
      fieldType: 'int',
      fieldComment: '',
      nullable: true,
      defaultKind: 'none' as const,
    };
    const schema = { tableName: 'users', tableComment: '', fields: [field], indexes: [] };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(createTextStream([JSON.stringify(schema)])));
    const result = await requestGenerateTable(
      {
        description: '继续设计',
        dbType: 'mysql',
        options: { mode: 'generate', existingConfig: { rows: [] }, previousSchema: schema },
      },
      { signal: new AbortController().signal },
    );
    expect(result.result.fields[0].id).toBe('proposal');
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.previousSchema).toEqual(schema);
    expect(request.existingConfig).toBeUndefined();
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
