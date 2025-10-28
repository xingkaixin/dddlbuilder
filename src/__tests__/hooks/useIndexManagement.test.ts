import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIndexManagement } from '@/hooks'
import type { IndexField, IndexDefinition } from '@/types'

describe('useIndexManagement', () => {
  const defaultTableName = 'test_table'
  const defaultFields = ['id', 'name', 'email', 'created_at']

  it('应该初始化为空状态', () => {
    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields)
    )

    expect(result.current.indexInput).toBe('')
    expect(result.current.currentIndexFields).toEqual([])
    expect(result.current.indexes).toEqual([])
    expect(result.current.fieldSuggestions).toEqual([])
    expect(result.current.showFieldSuggestions).toBe(false)
    expect(result.current.selectedSuggestionIndex).toBe(0)
    expect(typeof result.current.setIndexInput).toBe('function')
    expect(typeof result.current.addFieldToIndex).toBe('function')
    expect(typeof result.current.removeFieldFromIndex).toBe('function')
    expect(typeof result.current.toggleFieldDirection).toBe('function')
    expect(typeof result.current.addIndex).toBe('function')
    expect(typeof result.current.removeIndex).toBe('function')
    expect(typeof result.current.updateIndexNames).toBe('function')
  })

  it('应该从持久化状态恢复数据', () => {
    const persistedState = {
      indexInput: 'test_input',
      currentIndexFields: [{ name: 'id', direction: 'ASC' }],
      indexes: [
        {
          id: '1',
          name: 'idx_test_table_name',
          fields: [{ name: 'name', direction: 'ASC' }],
          unique: false,
          isPrimary: false
        }
      ]
    }

    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields, persistedState)
    )

    expect(result.current.indexInput).toBe('test_input')
    expect(result.current.currentIndexFields).toEqual([
      { name: 'id', direction: 'ASC' }
    ])
    expect(result.current.indexes).toHaveLength(1)
    expect(result.current.indexes[0].name).toBe('idx_test_table_name')
  })

  it('应该根据输入过滤字段建议', () => {
    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields)
    )

    act(() => {
      result.current.setIndexInput('na')
    })

    expect(result.current.fieldSuggestions).toEqual(['name'])
  })

  it('应该排除已在当前索引中的字段', () => {
    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields)
    )

    // 先添加一个字段到当前索引
    act(() => {
      result.current.addFieldToIndex('name')
    })

    act(() => {
      result.current.setIndexInput('na')
    })

    expect(result.current.fieldSuggestions).toEqual([])
  })

  it('应该能够添加字段到当前索引', () => {
    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields)
    )

    act(() => {
      result.current.addFieldToIndex('name')
    })

    expect(result.current.currentIndexFields).toEqual([
      { name: 'name', direction: 'ASC' }
    ])
    expect(result.current.indexInput).toBe('')
    expect(result.current.showFieldSuggestions).toBe(false)
    expect(result.current.selectedSuggestionIndex).toBe(0)
  })

  it('应该能够从当前索引移除字段', () => {
    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields)
    )

    // 先添加两个字段
    act(() => {
      result.current.addFieldToIndex('name')
      result.current.addFieldToIndex('email')
    })

    expect(result.current.currentIndexFields).toHaveLength(2)

    // 移除第二个字段
    act(() => {
      result.current.removeFieldFromIndex(1)
    })

    expect(result.current.currentIndexFields).toEqual([
      { name: 'name', direction: 'ASC' }
    ])
  })

  it('应该能够切换字段排序方向', () => {
    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields)
    )

    act(() => {
      result.current.addFieldToIndex('name')
    })

    expect(result.current.currentIndexFields[0].direction).toBe('ASC')

    // 切换方向
    act(() => {
      result.current.toggleFieldDirection(0)
    })

    expect(result.current.currentIndexFields[0].direction).toBe('DESC')

    // 再次切换
    act(() => {
      result.current.toggleFieldDirection(0)
    })

    expect(result.current.currentIndexFields[0].direction).toBe('ASC')
  })

  it('应该能够添加普通索引', () => {
    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields)
    )

    // 先添加字段
    act(() => {
      result.current.addFieldToIndex('name')
    })

    // 添加普通索引
    act(() => {
      result.current.addIndex(false, false)
    })

    expect(result.current.indexes).toHaveLength(1)
    const index = result.current.indexes[0]
    expect(index.name).toBe('idx_test_table_name')
    expect(index.unique).toBe(false)
    expect(index.isPrimary).toBe(false)
    expect(index.fields).toEqual([{ name: 'name', direction: 'ASC' }])
    expect(result.current.currentIndexFields).toEqual([])
  })

  it('应该能够添加唯一索引', () => {
    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields)
    )

    act(() => {
      result.current.addFieldToIndex('email')
    })

    act(() => {
      result.current.addIndex(true, false)
    })

    const index = result.current.indexes[0]
    expect(index.name).toBe('uk_test_table_email')
    expect(index.unique).toBe(true)
    expect(index.isPrimary).toBe(false)
  })

  it('应该能够添加主键索引', () => {
    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields)
    )

    act(() => {
      result.current.addFieldToIndex('id')
    })

    act(() => {
      result.current.addIndex(false, true)
    })

    const index = result.current.indexes[0]
    expect(index.name).toBe('pk_test_table_id')
    expect(index.unique).toBe(false)
    expect(index.isPrimary).toBe(true)
  })

  it('应该为多字段索引生成正确的名称', () => {
    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields)
    )

    act(() => {
      result.current.addFieldToIndex('name')
      result.current.addFieldToIndex('email')
    })

    act(() => {
      result.current.addIndex(true, false)
    })

    const index = result.current.indexes[0]
    expect(index.name).toBe('uk_test_table_name_email')
  })

  it('应该不能在没有字段时添加索引', () => {
    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields)
    )

    const initialCount = result.current.indexes.length

    act(() => {
      result.current.addIndex(false, false)
    })

    expect(result.current.indexes).toHaveLength(initialCount)
  })

  it('应该处理不存在的索引ID', () => {
    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields)
    )

    const initialCount = result.current.indexes.length

    // 尝试移除不存在的索引
    act(() => {
      result.current.removeIndex('non_existent_id')
    })

    expect(result.current.indexes).toHaveLength(initialCount)
  })

  it('应该处理大小写不敏感的字段过滤', () => {
    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields)
    )

    act(() => {
      result.current.setIndexInput('EMAIL')
    })

    expect(result.current.fieldSuggestions).toEqual(['email'])
  })

  it('应该处理部分匹配的字段过滤', () => {
    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields)
    )

    act(() => {
      result.current.setIndexInput('creat')
    })

    expect(result.current.fieldSuggestions).toEqual(['created_at'])
  })

  it('应该重置相关状态当添加索引后', () => {
    const { result } = renderHook(() =>
      useIndexManagement(defaultTableName, defaultFields)
    )

    // 设置输入和建议
    act(() => {
      result.current.setIndexInput('test')
      result.current.setShowFieldSuggestions(true)
      result.current.setSelectedSuggestionIndex(2)
    })

    expect(result.current.showFieldSuggestions).toBe(true)
    expect(result.current.selectedSuggestionIndex).toBe(2)

    // 添加字段
    act(() => {
      result.current.addFieldToIndex('name')
    })

    expect(result.current.indexInput).toBe('')
    expect(result.current.showFieldSuggestions).toBe(false)
    expect(result.current.selectedSuggestionIndex).toBe(0)
  })
})