import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSqlGeneration } from '@/hooks';
import type { NormalizedField, IndexDefinition } from '@ddlbuilder/shared-types';

const baseFields: NormalizedField[] = [
  {
    name: 'id',
    type: 'int',
    comment: '',
    nullable: false,
    defaultKind: 'auto_increment',
    defaultValue: '',
    onUpdate: 'none',
  },
];

const noopIndexes: IndexDefinition[] = [];

const defineClipboard = (writeText: (value: string) => Promise<void>) => {
  const existing = navigator.clipboard;

  if (existing && typeof existing.writeText === 'function') {
    const spy = vi.spyOn(existing, 'writeText').mockImplementation(writeText);
    return {
      mock: spy,
      restore: () => spy.mockRestore(),
    };
  }

  const mock = vi.fn(writeText);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mock },
  });

  return {
    mock,
    restore: () => {
      Reflect.deleteProperty(navigator, 'clipboard');
    },
  };
};

describe('useSqlGeneration', () => {
  it('枚举注释只在生成 SQL 字面量时转义一次', () => {
    const fields: NormalizedField[] = [
      {
        ...baseFields[0],
        comment: "Owner's status",
        enumMeta: [{ value: 'active', i18n: { 'en-US': "It's active" } }],
      },
    ];
    const { result } = renderHook(() =>
      useSqlGeneration('table', 'mysql', '', 'users', '', '', true, fields, [], [], 'compact'),
    );
    console.info('generated enum comment SQL', result.current.generatedSql);
    expect(result.current.generatedSql).toContain(
      "COMMENT 'Owner''s status | 枚举: active(It''s active)'",
    );
    expect(fields[0].comment).toBe("Owner's status");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'execCommand');
  });

  it('应该生成 SQL 并使用 Clipboard API 复制', async () => {
    const { mock: writeTextMock, restore } = defineClipboard(async () => {});

    const { result } = renderHook(() =>
      useSqlGeneration(
        'table',
        'mysql',
        '',
        'users',
        '用户表',
        '',
        true,
        baseFields,
        noopIndexes,
        ['CBD_READ'],
        'compact',
      ),
    );

    expect(result.current.generatedSql).toContain('CREATE TABLE users');
    expect(result.current.generatedDcl).toContain('GRANT SELECT ON users TO CBD_READ;');

    let sqlResult = false;
    await act(async () => {
      sqlResult = await result.current.copySql();
    });

    expect(sqlResult).toBe(true);
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock).toHaveBeenCalledWith(result.current.generatedSql);

    writeTextMock.mockClear();

    let dclResult = false;
    await act(async () => {
      dclResult = await result.current.copyDcl();
    });

    expect(dclResult).toBe(true);
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock).toHaveBeenCalledWith(result.current.generatedDcl);

    restore();
  });

  it('应该在 Clipboard API 失败时回退到 execCommand', async () => {
    const { mock: writeTextMock, restore } = defineClipboard(async () => {
      throw new Error('clipboard unavailable');
    });
    const execCommandMock = vi.fn().mockReturnValue(true);

    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      writable: true,
      value: execCommandMock,
    });

    const { result } = renderHook(() =>
      useSqlGeneration(
        'table',
        'mysql',
        '',
        'users',
        '',
        '',
        true,
        baseFields,
        noopIndexes,
        [],
        'compact',
      ),
    );

    let sqlResult = false;
    await act(async () => {
      sqlResult = await result.current.copySql();
    });

    expect(sqlResult).toBe(true);
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(execCommandMock).toHaveBeenCalledWith('copy');

    execCommandMock.mockClear();

    let dclResult = false;
    await act(async () => {
      dclResult = await result.current.copyDcl();
    });

    expect(dclResult).toBe(true);
    expect(writeTextMock).toHaveBeenCalledTimes(2);
    expect(execCommandMock).toHaveBeenCalledWith('copy');

    restore();
  });

  it('填写 schema 时应生成限定表名', () => {
    const { result } = renderHook(() =>
      useSqlGeneration(
        'table',
        'mysql',
        'public',
        'users',
        '',
        '',
        true,
        baseFields,
        noopIndexes,
        ['reader'],
        'compact',
      ),
    );

    expect(result.current.generatedSql).toContain('CREATE TABLE public.users');
    expect(result.current.generatedDcl).toContain('GRANT SELECT ON public.users TO reader;');
  });

  it('对齐模式应传递到 DDL 生成', () => {
    const alignedFields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
        comment: '主键',
        nullable: false,
        defaultKind: 'auto_increment',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'created_at',
        type: 'timestamp',
        comment: '创建时间',
        nullable: false,
        defaultKind: 'current_timestamp',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const { result } = renderHook(() =>
      useSqlGeneration(
        'table',
        'mysql',
        '',
        'users',
        '',
        '',
        true,
        alignedFields,
        noopIndexes,
        [],
        'aligned',
      ),
    );

    expect(result.current.generatedSql).toContain(
      "id          INT AUTO_INCREMENT NOT NULL                   COMMENT '主键'",
    );
    expect(result.current.generatedSql).toContain(
      "created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间'",
    );
  });
});
