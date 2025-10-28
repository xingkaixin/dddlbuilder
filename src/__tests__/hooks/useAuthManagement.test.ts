import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAuthManagement } from '@/hooks'

describe('useAuthManagement', () => {
  it('应该初始化为空状态', () => {
    const { result } = renderHook(() => useAuthManagement())

    expect(result.current.authInput).toBe('')
    expect(result.current.authObjects).toEqual([])
    expect(typeof result.current.addAuthObject).toBe('function')
    expect(typeof result.current.removeAuthObject).toBe('function')
    expect(typeof result.current.setAuthInput).toBe('function')
  })

  it('应该能够设置授权输入值', () => {
    const { result } = renderHook(() => useAuthManagement())

    act(() => {
      result.current.setAuthInput('test_user')
    })

    expect(result.current.authInput).toBe('test_user')
  })

  it('应该能够添加授权对象', () => {
    const { result } = renderHook(() => useAuthManagement())

    // 设置输入值
    act(() => {
      result.current.setAuthInput('user1')
    })

    // 添加授权对象
    act(() => {
      result.current.addAuthObject('user1')
    })

    expect(result.current.authObjects).toEqual(['user1'])
    expect(result.current.authInput).toBe('') // 添加后应该清空输入
  })

  it('应该能够添加多个授权对象', () => {
    const { result } = renderHook(() => useAuthManagement())

    const authUsers = ['user1', 'user2', 'user3']

    authUsers.forEach(user => {
      act(() => {
        result.current.addAuthObject(user)
      })
    })

    expect(result.current.authObjects).toEqual(authUsers)
    expect(result.current.authInput).toBe('')
  })

  it('应该能够删除授权对象', () => {
    const { result } = renderHook(() => useAuthManagement())

    // 先添加一些授权对象
    const initialAuths = ['user1', 'user2', 'user3']
    initialAuths.forEach(user => {
      act(() => {
        result.current.addAuthObject(user)
      })
    })

    // 删除第二个授权对象
    act(() => {
      result.current.removeAuthObject(1)
    })

    expect(result.current.authObjects).toEqual(['user1', 'user3'])
  })

  it('应该能够删除第一个授权对象', () => {
    const { result } = renderHook(() => useAuthManagement())

    // 添加授权对象
    act(() => {
      result.current.addAuthObject('user1')
      result.current.addAuthObject('user2')
    })

    // 删除第一个
    act(() => {
      result.current.removeAuthObject(0)
    })

    expect(result.current.authObjects).toEqual(['user2'])
  })

  it('应该能够删除最后一个授权对象', () => {
    const { result } = renderHook(() => useAuthManagement())

    // 添加授权对象
    act(() => {
      result.current.addAuthObject('user1')
      result.current.addAuthObject('user2')
    })

    // 删除最后一个
    act(() => {
      result.current.removeAuthObject(1)
    })

    expect(result.current.authObjects).toEqual(['user1'])
  })

  it('应该能够删除所有授权对象', () => {
    const { result } = renderHook(() => useAuthManagement())

    // 添加多个授权对象
    const authUsers = ['user1', 'user2', 'user3']
    authUsers.forEach(user => {
      act(() => {
        result.current.addAuthObject(user)
      })
    })

    // 从后往前删除所有授权对象
    for (let i = result.current.authObjects.length - 1; i >= 0; i--) {
      act(() => {
        result.current.removeAuthObject(i)
      })
    }

    expect(result.current.authObjects).toEqual([])
  })

  it('应该处理无效的删除索引', () => {
    const { result } = renderHook(() => useAuthManagement())

    // 添加一些授权对象
    act(() => {
      result.current.addAuthObject('user1')
      result.current.addAuthObject('user2')
    })

    const originalAuthObjects = [...result.current.authObjects]

    // 尝试删除无效索引
    act(() => {
      result.current.removeAuthObject(-1)
    })
    expect(result.current.authObjects).toEqual(originalAuthObjects)

    act(() => {
      result.current.removeAuthObject(10)
    })
    expect(result.current.authObjects).toEqual(originalAuthObjects)
  })

  it('应该忽略空字符串授权对象', () => {
    const { result } = renderHook(() => useAuthManagement())

    // 尝试添加空字符串
    act(() => {
      result.current.addAuthObject('')
    })

    expect(result.current.authObjects).toEqual([])
    expect(result.current.authInput).toBe('')
  })

  it('应该能够处理包含特殊字符的授权对象', () => {
    const { result } = renderHook(() => useAuthManagement())

    const specialAuth = 'user@domain.com#$%^&*()'

    act(() => {
      result.current.addAuthObject(specialAuth)
    })

    expect(result.current.authObjects).toEqual([specialAuth])
  })

  it('应该能够处理长授权对象名称', () => {
    const { result } = renderHook(() => useAuthManagement())

    const longAuth = 'a'.repeat(1000)

    act(() => {
      result.current.addAuthObject(longAuth)
    })

    expect(result.current.authObjects).toEqual([longAuth])
  })

  it('应该能够重复添加相同的授权对象', () => {
    const { result } = renderHook(() => useAuthManagement())

    const user = 'user1'

    // 多次添加相同的授权对象
    act(() => {
      result.current.addAuthObject(user)
      result.current.addAuthObject(user)
      result.current.addAuthObject(user)
    })

    expect(result.current.authObjects).toEqual([user, user, user])
  })

  it('应该在添加授权对象后清空输入', () => {
    const { result } = renderHook(() => useAuthManagement())

    // 设置输入值
    act(() => {
      result.current.setAuthInput('test_user')
    })

    expect(result.current.authInput).toBe('test_user')

    // 添加授权对象
    act(() => {
      result.current.addAuthObject('test_user')
    })

    expect(result.current.authInput).toBe('')
  })

  it('应该能够快速连续操作授权对象', () => {
    const { result } = renderHook(() => useAuthManagement())

    // 快速连续添加
    act(() => {
      result.current.addAuthObject('user1')
      result.current.addAuthObject('user2')
      result.current.addAuthObject('user3')
    })

    expect(result.current.authObjects).toEqual(['user1', 'user2', 'user3'])

    // 快速连续删除
    act(() => {
      result.current.removeAuthObject(0)
      result.current.removeAuthObject(0)
    })

    expect(result.current.authObjects).toEqual(['user3'])
  })
})