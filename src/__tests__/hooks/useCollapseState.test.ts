import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCollapseState } from '@/hooks'

describe('useCollapseState', () => {
  it('应该初始化为展开状态', () => {
    const { result } = renderHook(() => useCollapseState())

    expect(result.current.isIndexCollapsed).toBe(false)
    expect(result.current.isAuthCollapsed).toBe(false)
    expect(typeof result.current.toggleIndexCollapse).toBe('function')
    expect(typeof result.current.toggleAuthCollapse).toBe('function')
  })

  it('应该能够切换索引折叠状态', () => {
    const { result } = renderHook(() => useCollapseState())

    // 初始状态：展开
    expect(result.current.isIndexCollapsed).toBe(false)

    // 切换为折叠
    act(() => {
      result.current.toggleIndexCollapse()
    })
    expect(result.current.isIndexCollapsed).toBe(true)

    // 再次切换为展开
    act(() => {
      result.current.toggleIndexCollapse()
    })
    expect(result.current.isIndexCollapsed).toBe(false)
  })

  it('应该能够切换授权折叠状态', () => {
    const { result } = renderHook(() => useCollapseState())

    // 初始状态：展开
    expect(result.current.isAuthCollapsed).toBe(false)

    // 切换为折叠
    act(() => {
      result.current.toggleAuthCollapse()
    })
    expect(result.current.isAuthCollapsed).toBe(true)

    // 再次切换为展开
    act(() => {
      result.current.toggleAuthCollapse()
    })
    expect(result.current.isAuthCollapsed).toBe(false)
  })

  it('应该独立管理两个折叠状态', () => {
    const { result } = renderHook(() => useCollapseState())

    // 初始状态都为展开
    expect(result.current.isIndexCollapsed).toBe(false)
    expect(result.current.isAuthCollapsed).toBe(false)

    // 只切换索引折叠状态
    act(() => {
      result.current.toggleIndexCollapse()
    })
    expect(result.current.isIndexCollapsed).toBe(true)
    expect(result.current.isAuthCollapsed).toBe(false) // 授权状态不变

    // 只切换授权折叠状态
    act(() => {
      result.current.toggleAuthCollapse()
    })
    expect(result.current.isIndexCollapsed).toBe(true) // 索引状态不变
    expect(result.current.isAuthCollapsed).toBe(true)

    // 同时切换两个状态
    act(() => {
      result.current.toggleIndexCollapse()
      result.current.toggleAuthCollapse()
    })
    expect(result.current.isIndexCollapsed).toBe(false)
    expect(result.current.isAuthCollapsed).toBe(false)
  })

  it('应该能够连续多次切换索引状态', () => {
    const { result } = renderHook(() => useCollapseState())

    // 连续切换索引状态
    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.toggleIndexCollapse()
      })
      // 每次切换后，状态应该是 true（如果切换次数是奇数）或 false（如果偶数）
      expect(result.current.isIndexCollapsed).toBe((i + 1) % 2 === 1)
    }
  })

  it('应该能够连续多次切换授权状态', () => {
    const { result } = renderHook(() => useCollapseState())

    // 连续切换授权状态
    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.toggleAuthCollapse()
      })
      // 每次切换后，状态应该是 true（如果切换次数是奇数）或 false（如果偶数）
      expect(result.current.isAuthCollapsed).toBe((i + 1) % 2 === 1)
    }
  })

  it('应该在快速连续调用时正确处理状态', () => {
    const { result } = renderHook(() => useCollapseState())

    // 快速连续调用
    act(() => {
      result.current.toggleIndexCollapse()
      result.current.toggleIndexCollapse()
      result.current.toggleAuthCollapse()
      result.current.toggleAuthCollapse()
    })

    // 两次调用后应该回到初始状态
    expect(result.current.isIndexCollapsed).toBe(false)
    expect(result.current.isAuthCollapsed).toBe(false)
  })

  it('应该保持状态的一致性', () => {
    const { result } = renderHook(() => useCollapseState())

    // 切换到各种状态组合
    const states = [
      [false, false], // 初始状态
      [true, false],  // 只折叠索引
      [true, true],   // 都折叠
      [false, true],  // 只折叠授权
      [false, false], // 回到初始状态
    ]

    states.forEach(([expectedIndex, expectedAuth]) => {
      if (expectedIndex !== result.current.isIndexCollapsed) {
        act(() => {
          result.current.toggleIndexCollapse()
        })
      }
      if (expectedAuth !== result.current.isAuthCollapsed) {
        act(() => {
          result.current.toggleAuthCollapse()
        })
      }

      expect(result.current.isIndexCollapsed).toBe(expectedIndex)
      expect(result.current.isAuthCollapsed).toBe(expectedAuth)
    })
  })
})