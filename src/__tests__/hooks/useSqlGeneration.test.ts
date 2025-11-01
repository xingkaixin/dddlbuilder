import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSqlGeneration } from '@/hooks'
import type { NormalizedField, IndexDefinition } from '@/types'

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
]

const noopIndexes: IndexDefinition[] = []

const defineClipboard = (writeText: (value: string) => Promise<void>) => {
  const existing = navigator.clipboard

  if (existing && typeof existing.writeText === 'function') {
    const spy = vi.spyOn(existing, 'writeText').mockImplementation(writeText)
    return {
      mock: spy,
      restore: () => spy.mockRestore(),
    }
  }

  const mock = vi.fn(writeText)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mock },
  })

  return {
    mock,
    restore: () => {
      Reflect.deleteProperty(navigator, 'clipboard')
    },
  }
}

describe('useSqlGeneration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(document, 'execCommand')
  })

  it('应该生成 SQL 并使用 Clipboard API 复制', async () => {
    const { mock: writeTextMock, restore } = defineClipboard(async () => {})

    const { result } = renderHook(() =>
      useSqlGeneration(
        'mysql',
        'users',
        '用户表',
        baseFields,
        noopIndexes,
        ['CBD_READ'],
      ),
    )

    expect(result.current.generatedSql).toContain('CREATE TABLE users')
    expect(result.current.generatedDcl).toContain('GRANT SELECT ON users TO CBD_READ;')

    let sqlResult = false
    await act(async () => {
      sqlResult = await result.current.copySql()
    })

    expect(sqlResult).toBe(true)
    expect(writeTextMock).toHaveBeenCalledTimes(1)
    expect(writeTextMock).toHaveBeenCalledWith(result.current.generatedSql)

    writeTextMock.mockClear()

    let dclResult = false
    await act(async () => {
      dclResult = await result.current.copyDcl()
    })

    expect(dclResult).toBe(true)
    expect(writeTextMock).toHaveBeenCalledTimes(1)
    expect(writeTextMock).toHaveBeenCalledWith(result.current.generatedDcl)

    restore()
  })

  it('应该在 Clipboard API 失败时回退到 execCommand', async () => {
    const { mock: writeTextMock, restore } = defineClipboard(async () => {
      throw new Error('clipboard unavailable')
    })
    const execCommandMock = vi.fn().mockReturnValue(true)

    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      writable: true,
      value: execCommandMock,
    })

    const { result } = renderHook(() =>
      useSqlGeneration(
        'mysql',
        'users',
        '',
        baseFields,
        noopIndexes,
        [],
      ),
    )

    let sqlResult = false
    await act(async () => {
      sqlResult = await result.current.copySql()
    })

    expect(sqlResult).toBe(true)
    expect(writeTextMock).toHaveBeenCalledTimes(1)
    expect(execCommandMock).toHaveBeenCalledWith('copy')

    execCommandMock.mockClear()

    let dclResult = false
    await act(async () => {
      dclResult = await result.current.copyDcl()
    })

    expect(dclResult).toBe(true)
    expect(writeTextMock).toHaveBeenCalledTimes(2)
    expect(execCommandMock).toHaveBeenCalledWith('copy')

    restore()
  })
})
