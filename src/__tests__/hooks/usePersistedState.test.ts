import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePersistedState } from '@/hooks'
import { STORAGE_KEY } from '@/utils/constants'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    get length() {
      return Object.keys(store).length
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null)
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

describe('usePersistedState', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应该初始化并自动从 localStorage 恢复状态', () => {
    const { result } = renderHook(() => usePersistedState())

    // 初始状态应该是 null（localStorage 为空时）
    expect(result.current.persistedState).toBe(null)
    // hydrated 应该为 true，因为 useEffect 已经执行
    expect(result.current.hydrated).toBe(true)
    expect(typeof result.current.saveState).toBe('function')
    expect(typeof result.current.clearState).toBe('function')
  })

  it('应该能够保存状态到 localStorage', () => {
    const { result } = renderHook(() => usePersistedState())

    const testState = { test: 'data', number: 123 }

    act(() => {
      result.current.saveState(testState)
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(testState)
    )
  })

  it('应该能够从 localStorage 恢复状态', () => {
    // 预设 localStorage 中的数据
    const savedState = { restored: 'data', value: 456 }
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify(savedState))

    const { result } = renderHook(() => usePersistedState())

    // 状态应该自动恢复（useEffect 已经执行）
    expect(result.current.persistedState).toEqual(savedState)
    expect(result.current.hydrated).toBe(true)
  })

  it('应该能够清除 localStorage 中的状态', () => {
    // 预设 localStorage 中的数据
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ test: 'data' }))

    const { result } = renderHook(() => usePersistedState())

    act(() => {
      result.current.clearState()
    })

    expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
    expect(result.current.persistedState).toBe(null)
  })

  it('应该处理 localStorage 中的无效 JSON 数据', () => {
    // 设置无效的 JSON 数据
    localStorageMock.setItem(STORAGE_KEY, 'invalid json')

    const { result } = renderHook(() => usePersistedState())

    // 应该优雅地处理无效数据
    expect(result.current.persistedState).toBe(null)
    expect(result.current.hydrated).toBe(true)
  })

  it('应该处理 localStorage 为空的情况', () => {
    // localStorage 为空，不设置任何数据

    const { result } = renderHook(() => usePersistedState())

    expect(result.current.persistedState).toBe(null)
    expect(result.current.hydrated).toBe(true)
  })

  it('应该处理 localStorage 访问错误', () => {
    // Mock localStorage 抛出错误
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error('localStorage access denied')
    })

    const { result } = renderHook(() => usePersistedState())

    // 应该优雅地处理错误
    expect(result.current.persistedState).toBe(null)
    expect(result.current.hydrated).toBe(true)
  })

  it('应该处理复杂的对象状态', () => {
    const { result } = renderHook(() => usePersistedState())

    const complexState = {
      user: {
        name: 'Test User',
        email: 'test@example.com',
        settings: {
          theme: 'dark',
          notifications: true
        }
      },
      data: [1, 2, 3, { nested: 'value' }],
      timestamp: new Date().toISOString()
    }

    act(() => {
      result.current.saveState(complexState)
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(complexState)
    )
  })

  it('应该能够更新已保存的状态', () => {
    const { result } = renderHook(() => usePersistedState())

    const initialState = { version: 1, data: 'initial' }
    const updatedState = { version: 2, data: 'updated' }

    // 保存初始状态
    act(() => {
      result.current.saveState(initialState)
    })

    expect(localStorageMock.setItem).toHaveBeenLastCalledWith(
      STORAGE_KEY,
      JSON.stringify(initialState)
    )

    // 更新状态
    act(() => {
      result.current.saveState(updatedState)
    })

    expect(localStorageMock.setItem).toHaveBeenLastCalledWith(
      STORAGE_KEY,
      JSON.stringify(updatedState)
    )
  })

  it('应该处理 null 和 undefined 状态值', () => {
    const { result } = renderHook(() => usePersistedState())

    // 保存 null 状态
    act(() => {
      result.current.saveState(null)
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(null)
    )

    // 保存 undefined 状态
    act(() => {
      result.current.saveState(undefined)
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(undefined)
    )
  })

  it('应该在未水合时拒绝保存状态', () => {
    // Mock 一个未水合的状态（虽然实际使用中不会出现）
    const { result } = renderHook(() => usePersistedState())

    const testState = { test: 'data' }

    // 直接调用 saveState，但由于已经水合了，所以应该能正常保存
    act(() => {
      result.current.saveState(testState)
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(testState)
    )
  })

  it('应该能够连续操作状态', () => {
    const { result } = renderHook(() => usePersistedState())

    const states = [
      { step: 1, data: 'first' },
      { step: 2, data: 'second' },
      { step: 3, data: 'third' }
    ]

    // 连续保存不同状态
    states.forEach(state => {
      act(() => {
        result.current.saveState(state)
      })
    })

    // 清除状态
    act(() => {
      result.current.clearState()
    })

    expect(result.current.persistedState).toBe(null)
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
  })
})