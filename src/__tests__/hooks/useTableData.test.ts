import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTableData } from '@/hooks'
import type { FieldRow } from '@/types'

describe('useTableData', () => {
  const createTestRow = (overrides: Partial<FieldRow> = {}): FieldRow => ({
    order: 1,
    fieldName: '',
    fieldType: '',
    fieldComment: '',
    nullable: '是',
    defaultKind: '无',
    defaultValue: '',
    onUpdate: '无',
    ...overrides
  })

  const createInitialRows = (): FieldRow[] => [
    createTestRow({ order: 1, fieldName: 'id', fieldType: 'int', nullable: '否' }),
    createTestRow({ order: 2, fieldName: 'name', fieldType: 'varchar(255)', nullable: '否' }),
    createTestRow({ order: 3, fieldName: 'email', fieldType: 'varchar(255)', nullable: '是' })
  ]

  it('应该初始化为初始状态', () => {
    const initialRows = createInitialRows()
    const { result } = renderHook(() => useTableData(initialRows))

    expect(result.current.rows).toEqual(initialRows)
    expect(result.current.duplicateNameSet).toBeInstanceOf(Set)
    expect(result.current.duplicateNameSet.size).toBe(0)
    expect(result.current.normalizedFields).toHaveLength(3)
    expect(typeof result.current.handleRowsChange).toBe('function')
    expect(typeof result.current.handleCreateRow).toBe('function')
    expect(typeof result.current.handleRemoveRow).toBe('function')
    expect(typeof result.current.handleAddRows).toBe('function')
  })

  it('应该从持久化状态恢复数据', () => {
    const persistedRows = [
      createTestRow({ order: 1, fieldName: 'user_id', fieldType: 'uuid', nullable: '否' }),
      createTestRow({ order: 2, fieldName: 'username', fieldType: 'varchar(50)', nullable: '否' })
    ]

    const { result } = renderHook(() => useTableData([], persistedRows))

    expect(result.current.rows).toEqual(persistedRows)
    expect(result.current.normalizedFields).toHaveLength(2)
    expect(result.current.normalizedFields[0].name).toBe('user_id')
  })

  it('应该检测重复的字段名', () => {
    const rowsWithDup = [
      createTestRow({ order: 1, fieldName: 'name', fieldType: 'varchar(255)' }),
      createTestRow({ order: 2, fieldName: 'name', fieldType: 'text' }),
      createTestRow({ order: 3, fieldName: 'email', fieldType: 'varchar(255)' }),
      createTestRow({ order: 4, fieldName: 'name', fieldType: 'text' })
    ]

    const { result } = renderHook(() => useTableData(rowsWithDup))

    expect(result.current.duplicateNameSet.has('name')).toBe(true)
    expect(result.current.duplicateNameSet.has('email')).toBe(false)
    expect(result.current.duplicateNameSet.size).toBe(1)
  })

  it('应该处理空字段名', () => {
    const rowsWithEmpty = [
      createTestRow({ order: 1, fieldName: 'valid_field', fieldType: 'int' }),
      createTestRow({ order: 2, fieldName: '', fieldType: 'varchar' }),
      createTestRow({ order: 3, fieldName: null as any, fieldType: 'text' })
    ]

    const { result } = renderHook(() => useTableData(rowsWithEmpty))

    expect(result.current.duplicateNameSet.size).toBe(0)
  })

  it('应该处理行变更', () => {
    const initialRows = createInitialRows()
    const { result } = renderHook(() => useTableData(initialRows))

    const changes = [
      [0, 'fieldName', 'id', 'user_id'], // 修改字段名
      [0, 'fieldType', 'int', 'bigint'], // 修改字段类型
      [0, 'fieldComment', '', 'Primary key'], // 修改注释
    ]

    act(() => {
      result.current.handleRowsChange(changes, 'edit')
    })

    const updatedRow = result.current.rows[0]
    expect(updatedRow.fieldName).toBe('user_id')
    expect(updatedRow.fieldType).toBe('bigint')
    expect(updatedRow.fieldComment).toBe('Primary key')
  })

  it('应该创建新行', () => {
    const initialRows = createInitialRows()
    const { result } = renderHook(() => useTableData(initialRows))

    const originalLength = result.current.rows.length

    act(() => {
      result.current.handleCreateRow(1, 1)
    })

    expect(result.current.rows.length).toBe(originalLength + 1)
    const newRow = result.current.rows[result.current.rows.length - 1]
    expect(newRow.order).toBe(result.current.rows.length)
    // 新行会从现有数据复制，所以可能不是空的
    expect(newRow).toBeDefined()
  })

  it('应该删除行', () => {
    const initialRows = createInitialRows()
    const { result } = renderHook(() => useTableData(initialRows))

    const originalLength = result.current.rows.length

    act(() => {
      result.current.handleRemoveRow(1, 1) // 删除第二行
    })

    expect(result.current.rows.length).toBe(originalLength - 1)
    expect(result.current.rows[0].fieldName).toBe('id')
    expect(result.current.rows[1].fieldName).toBe('email')
  })

  it('应该添加多行', () => {
    const initialRows = createInitialRows()
    const { result } = renderHook(() => useTableData(initialRows))

    const originalLength = result.current.rows.length

    act(() => {
      result.current.handleAddRows(3)
    })

    expect(result.current.rows.length).toBe(originalLength + 3)
  })

  it('应该确保行顺序正确', () => {
    const initialRows = createInitialRows()
    const { result } = renderHook(() => useTableData(initialRows))

    // 删除第二行
    act(() => {
      result.current.handleRemoveRow(1, 1)
    })

    // 检查顺序是否重新排列
    expect(result.current.rows[0].order).toBe(1)
    expect(result.current.rows[1].order).toBe(2) // 原来的第三行变成第二行
  })

  it('应该处理自增字段的特殊逻辑', () => {
    const initialRows = createInitialRows()
    const { result } = renderHook(() => useTableData(initialRows))

    // 将第一行改为自增
    act(() => {
      result.current.handleRowsChange([[0, 'defaultKind', '无', '自增']], 'edit')
    })

    const updatedRow = result.current.rows[0]
    expect(updatedRow.defaultKind).toBe('自增')
    expect(updatedRow.nullable).toBe('否') // 自增字段应该为 NOT NULL
  })

  it('应该处理常量字段的默认值逻辑', () => {
    const initialRows = createInitialRows()
    const { result } = renderHook(() => useTableData(initialRows))

    // 设置默认值为常量
    act(() => {
      result.current.handleRowsChange([[0, 'defaultKind', '无', '常量']], 'edit')
      result.current.handleRowsChange([[0, 'defaultValue', '', 'test_value']], 'edit')
    })

    expect(result.current.rows[0].defaultKind).toBe('常量')
    expect(result.current.rows[0].defaultValue).toBe('test_value')

    // 切换为其他类型
    act(() => {
      result.current.handleRowsChange([[0, 'defaultKind', '常量', '无']], 'edit')
    })

    expect(result.current.rows[0].defaultKind).toBe('无')
    expect(result.current.rows[0].defaultValue).toBe('') // 非常量时清空默认值
  })

  it('应该处理 null 和 undefined 值', () => {
    const initialRows = createInitialRows()
    const { result } = renderHook(() => useTableData(initialRows))

    act(() => {
      result.current.handleRowsChange([
        [0, 'fieldName', 'id', null],
        [1, 'fieldType', 'varchar', undefined],
        [0, 'defaultValue', 'test', null]
      ], 'edit')
    })

    const firstRow = result.current.rows[0]
    const secondRow = result.current.rows[1]

    expect(firstRow.fieldName).toBe('')
    expect(firstRow.defaultValue).toBe('')
    expect(secondRow.fieldType).toBe('')
  })

  it('应该忽略非字符串属性和 order 属性', () => {
    const initialRows = createInitialRows()
    const { result } = renderHook(() => useTableData(initialRows))

    const originalOrder = result.current.rows[0].order

    act(() => {
      result.current.handleRowsChange([
        [0, 'order', 1, 999], // 应该被忽略
        [0, 0, 'fieldName', 'test'] // 数字属性名应该被忽略
      ], 'edit')
    })

    expect(result.current.rows[0].order).toBe(originalOrder) // order 没有改变
    expect(result.current.rows[0].fieldName).toBe('id') // 数字属性名被忽略
  })

  it('应该自动创建缺失的行', () => {
    const initialRows = createInitialRows()
    const { result } = renderHook(() => useTableData(initialRows))

    // 尝试修改超出索引的行
    act(() => {
      result.current.handleRowsChange([
        [10, 'fieldName', 'new_field', 'test_value']
      ], 'edit')
    })

    // 应该自动创建足够多的行
    expect(result.current.rows.length).toBeGreaterThan(10)
    expect(result.current.rows[10].fieldName).toBe('test_value')
  })

  it('应该正确规范化字段', () => {
    const rowsWithWhitespace = [
      createTestRow({
        order: 1,
        fieldName: '  id  ',
        fieldType: '  int  ',
        fieldComment: '  Primary key  ',
        nullable: ' 否 '
      })
    ]

    const { result } = renderHook(() => useTableData(rowsWithWhitespace))

    const normalized = result.current.normalizedFields[0]
    expect(normalized.name).toBe('id')
    expect(normalized.type).toBe('int')
    expect(normalized.comment).toBe('Primary key')
    expect(normalized.nullable).toBe(false)
  })

  it('应该过滤无效字段', () => {
    const rowsWithInvalid = [
      createTestRow({ order: 1, fieldName: 'valid', fieldType: 'int' }),
      createTestRow({ order: 2, fieldName: '', fieldType: 'varchar' }), // 空字段名
      createTestRow({ order: 3, fieldName: 'also_valid', fieldType: 'text' }),
      createTestRow({ order: 4, fieldName: 'valid', fieldType: '' }) // 空字段类型
    ]

    const { result } = renderHook(() => useTableData(rowsWithInvalid))

    expect(result.current.normalizedFields).toHaveLength(2)
    expect(result.current.normalizedFields.map(f => f.name)).toEqual(['valid', 'also_valid'])
  })

  it('应该处理复杂的变更链', () => {
    const initialRows = createInitialRows()
    const { result } = renderHook(() => useTableData(initialRows))

    // 一次性进行多个变更
    act(() => {
      result.current.handleRowsChange([
        [0, 'fieldName', 'id', 'user_id'],
        [0, 'defaultKind', '无', '自增'],
        [1, 'fieldType', 'varchar(255)', 'varchar(100)'],
        [1, 'nullable', '否', '是'],
        [0, 'fieldComment', '', 'User ID'],
        [0, 'defaultValue', '', 'uuid_generate_v4()']
      ], 'edit')
    })

    const firstRow = result.current.rows[0]
    const secondRow = result.current.rows[1]

    expect(firstRow.fieldName).toBe('user_id')
    expect(firstRow.defaultKind).toBe('自增')
    expect(firstRow.nullable).toBe('否') // 自增字段自动设为 NOT NULL
    expect(firstRow.defaultValue).toBe('') // 自增字段默认值清空
    expect(firstRow.fieldComment).toBe('User ID')

    expect(secondRow.fieldType).toBe('varchar(100)')
    expect(secondRow.nullable).toBe('是')
  })

  it('应该处理批量操作', () => {
    const initialRows = createInitialRows()
    const { result } = renderHook(() => useTableData(initialRows))

    // 添加新行
    act(() => {
      result.current.handleAddRows(2)
    })

    expect(result.current.rows.length).toBe(5)

    // 批量修改新增的行
    act(() => {
      result.current.handleRowsChange([
        [3, 'fieldName', '', 'new_field1'],
        [4, 'fieldName', '', 'new_field2']
      ], 'edit')
    })

    expect(result.current.rows[3].fieldName).toBe('new_field1')
    expect(result.current.rows[4].fieldName).toBe('new_field2')
  })

  it('应该保持持久化状态的优先级', () => {
    const initialRows = createInitialRows()
    const persistedRows = [
      createTestRow({ order: 1, fieldName: 'persisted_field', fieldType: 'text' })
    ]

    const { result } = renderHook(() => useTableData(initialRows, persistedRows))

    // 应该使用持久化状态而不是初始状态
    expect(result.current.rows).toEqual(persistedRows)
    expect(result.current.normalizedFields[0].name).toBe('persisted_field')
  })
})