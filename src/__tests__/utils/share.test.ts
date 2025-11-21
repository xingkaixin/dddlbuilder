import { describe, it, expect } from 'vitest'
import { compressState, decompressState } from '@/utils/share'
import type { PersistedState } from '@/types'

describe('share utils', () => {
  const baseState: Partial<PersistedState> = {
    tableName: 'ttt',
    tableComment: '表注释',
    dbType: 'postgresql',
    rows: [
      {
        order: 2,
        fieldName: 'name',
        fieldType: 'varchar(50)',
        fieldComment: '姓名',
        nullable: '是',
        defaultKind: '无',
        defaultValue: '',
        onUpdate: '无'
      },
      {
        order: 1,
        fieldName: 'id',
        fieldType: 'serial',
        fieldComment: '主键',
        nullable: '否',
        defaultKind: '自增',
        defaultValue: '',
        onUpdate: '无'
      }
    ],
    indexes: [
      {
        id: 'idx-1',
        name: 'PRIMARY',
        fields: [{ name: 'id', direction: 'ASC' }],
        unique: true,
        isPrimary: true
      },
      {
        id: 'idx-2',
        name: 'uk_name',
        fields: [
          { name: 'name', direction: 'ASC' },
          { name: 'id', direction: 'DESC' }
        ],
        unique: true,
        isPrimary: false
      }
    ],
    authObjects: ['reader', 'writer']
  }

  it('compressState 和 decompressState 应保持核心数据一致', () => {
    const compressed = compressState(baseState)
    const restored = decompressState(compressed)

    expect(restored).not.toBeNull()
    expect(restored?.tableName).toBe('ttt')
    expect(restored?.tableComment).toBe('表注释')
    expect(restored?.dbType).toBe('postgresql')
    expect(restored?.rows?.map(r => r.fieldName)).toEqual(['name', 'id'])
    expect(restored?.rows?.[0]).toMatchObject({
      order: 1,
      fieldName: 'name',
      fieldComment: '姓名',
      nullable: '是',
      defaultKind: '无',
      onUpdate: '无'
    })
    expect(restored?.rows?.[1]).toMatchObject({
      order: 2,
      fieldName: 'id',
      fieldComment: '主键',
      nullable: '否',
      defaultKind: '自增',
      onUpdate: '无'
    })

    const indexes = restored?.indexes || []
    expect(indexes).toHaveLength(2)
    expect(indexes[0]).toMatchObject({
      name: 'PRIMARY',
      fields: [{ name: 'id', direction: 'ASC' }],
      unique: true,
      isPrimary: true
    })
    expect(indexes[1]).toMatchObject({
      name: 'uk_name',
      fields: [
        { name: 'name', direction: 'ASC' },
        { name: 'id', direction: 'DESC' }
      ],
      unique: true,
      isPrimary: false
    })

    expect(restored?.authObjects).toEqual(['reader', 'writer'])
    expect(restored?.addCount).toBe(10)
    expect(restored?.indexInput).toBe('')
    expect(restored?.authInput).toBe('')
  })

  it('decompressState 遇到非法输入时返回 null', () => {
    expect(decompressState('invalid-payload')).toBeNull()
  })
})
