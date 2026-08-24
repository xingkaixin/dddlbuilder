import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { ShareApiError, createShare, getShareState } from '@/services/shareService';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { buildDDL } from '@ddlbuilder/ddl-core';
import { normalizeFields } from '@/utils/helpers';

const createState = (): PersistedState => ({
  schemaName: '',
  tableName: 'users',
  tableComment: '用户表',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

type MockResponseOptions = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

const mockResponse = ({ ok, status, json }: MockResponseOptions) =>
  ({ ok, status, json }) as Response;

describe('shareService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('createShare 成功时应返回规范结果并发送正确请求', async () => {
    const state = createState();
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'share_1',
          url: 'https://example.com/share/share_1',
          expiresInSeconds: 3600,
        }),
      }),
    );

    const result = await createShare(state);

    expect(result).toEqual({
      id: 'share_1',
      url: 'https://example.com/share/share_1',
      expiresInSeconds: 3600,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/share', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state }),
    });
  });

  it('createShare 在响应字段非法时应抛出业务错误', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: async () => ({ id: 'share_1', url: 'https://example.com' }),
      }),
    );

    await expect(createShare(createState())).rejects.toThrow(
      i18n.t('services.shareResponseInvalid'),
    );
  });

  it('createShare 在 HTTP 错误时应抛出 ShareApiError 并透传 code/status', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({
        ok: false,
        status: 429,
        json: async () => ({
          error: 'rate limited',
          code: 'RATE_LIMIT_EXCEEDED',
        }),
      }),
    );

    await expect(createShare(createState())).rejects.toEqual(
      expect.objectContaining({
        status: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'rate limited',
      }),
    );
    await expect(createShare(createState())).rejects.toBeInstanceOf(ShareApiError);
  });

  it('createShare 在错误响应缺失 payload 时应回退到 requestFailed 文案', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
    );

    await expect(createShare(createState())).rejects.toMatchObject({
      status: 500,
      code: undefined,
      message: i18n.t('services.requestFailed', { status: 500 }),
    });
  });

  it('createShare 在错误响应 JSON 解析失败时也应回退到 requestFailed 文案', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({
        ok: false,
        status: 503,
        json: async () => {
          throw new Error('invalid json');
        },
      }),
    );

    await expect(createShare(createState())).rejects.toMatchObject({
      status: 503,
      code: undefined,
      message: i18n.t('services.requestFailed', { status: 503 }),
    });
  });

  it('getShareState 成功时应返回 state，并对 shareId 做 encodeURIComponent', async () => {
    const shareId = 'part/中文?x=1';
    const state = createState();
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: async () => ({ id: 's1', state }),
      }),
    );

    const result = await getShareState(shareId);

    expect(result).toEqual(state);
    expect(fetchMock).toHaveBeenCalledWith(`/api/share/${encodeURIComponent(shareId)}`);
  });

  it('getShareState 应归一化服务端 KV 里迁移前写入的字段枚举值', async () => {
    const legacyState = {
      ...createState(),
      rows: [
        {
          id: 'field-id',
          fieldName: 'id',
          fieldType: 'BIGINT',
          fieldComment: '主键',
          nullable: '否',
          defaultKind: '自增',
          defaultValue: '',
          onUpdate: '无',
        },
        {
          id: 'field-created_at',
          fieldName: 'created_at',
          fieldType: 'TIMESTAMP',
          fieldComment: '创建时间',
          nullable: '否',
          defaultKind: '当前时间',
          defaultValue: '',
          onUpdate: '当前时间',
        },
      ],
    } as unknown as PersistedState;

    vi.mocked(fetch).mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: async () => ({ id: 's1', state: legacyState }),
      }),
    );

    const result = await getShareState('s1');

    expect(result.rows).toEqual([
      { ...legacyState.rows[0], nullable: false, defaultKind: 'auto_increment', onUpdate: 'none' },
      {
        ...legacyState.rows[1],
        nullable: false,
        defaultKind: 'current_timestamp',
        onUpdate: 'current_timestamp',
      },
    ]);

    const ddl = buildDDL({
      dbType: 'mysql',
      tableName: result.tableName,
      tableComment: '',
      fields: normalizeFields(result.rows),
    });
    expect(ddl).toContain('AUTO_INCREMENT');
    expect(ddl).toContain('NOT NULL');
    expect(ddl).toContain('DEFAULT CURRENT_TIMESTAMP');
    expect(ddl).toContain('ON UPDATE CURRENT_TIMESTAMP');
  });

  it('getShareState 在 state 非对象时应抛出业务错误', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        json: async () => ({ id: 's1', state: null }),
      }),
    );

    await expect(getShareState('s1')).rejects.toThrow(i18n.t('services.shareDataInvalid'));
  });

  it('getShareState 在 HTTP 错误时应抛出 ShareApiError', async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockResponse({
        ok: false,
        status: 404,
        json: async () => ({ error: 'not found', code: 'SHARE_NOT_FOUND' }),
      }),
    );

    await expect(getShareState('missing')).rejects.toMatchObject({
      status: 404,
      code: 'SHARE_NOT_FOUND',
      message: 'not found',
    });
  });
});
