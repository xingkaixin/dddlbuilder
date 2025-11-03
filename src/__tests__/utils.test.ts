import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'
import { sanitizeIndexesForPersist } from '@/utils/indexUtils'
import type { IndexDefinition } from '@/types'
import type { FieldRow } from '@/App'
import {
  createEmptyRow,
  ensureOrder,
  sanitizeRowsForPersist,
  isIntegerType,
  isCharacterType,
  supportsUuidDefault,
  getCanonicalBaseType,
  getUiDefaultKindOptions,
  getUiOnUpdateOptions
} from '@/App'

describe('Utils', () => {
  describe('cn function', () => {
    it('should merge class names correctly', () => {
      expect(cn('bg-red-500', 'text-white')).toBe('bg-red-500 text-white')
    })

    it('should handle empty strings', () => {
      expect(cn('bg-red-500', '', 'text-white')).toBe('bg-red-500 text-white')
      expect(cn('', '', '')).toBe('')
    })

    it('should handle undefined and null values', () => {
      expect(cn('bg-red-500', undefined, 'text-white')).toBe('bg-red-500 text-white')
      expect(cn('bg-red-500', null, 'text-white')).toBe('bg-red-500 text-white')
      expect(cn(undefined, null, '')).toBe('')
    })

    it('should handle conditional classes', () => {
      const isActive = true
      const isError = false

      expect(cn('base-class', isActive && 'active', isError && 'error')).toBe(
        'base-class active'
      )
    })

    it('should handle arrays of classes', () => {
      expect(cn(['bg-red-500', 'text-white'], 'border')).toBe(
        'bg-red-500 text-white border'
      )
    })

    it('should handle objects with boolean values', () => {
      expect(cn({
        'bg-red-500': true,
        'text-white': true,
        'border': false,
        'shadow': undefined
      })).toBe('bg-red-500 text-white')
    })

    it('should handle mixed input types', () => {
      expect(cn(
        'base',
        ['extra1', 'extra2'],
        {
          'conditional1': true,
          'conditional2': false
        },
        'final'
      )).toBe('base extra1 extra2 conditional1 final')
    })

    it('should handle complex Tailwind class combinations', () => {
      expect(cn(
        'flex flex-col gap-4',
        'bg-white dark:bg-gray-800',
        'text-gray-900 dark:text-gray-100',
        'border border-gray-200 dark:border-gray-700',
        'rounded-lg shadow-sm',
        'hover:shadow-md transition-shadow'
      )).toBe(
        'flex flex-col gap-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-shadow'
      )
    })

    it('should handle conflicting Tailwind classes correctly', () => {
      // Tailwind CSS classes are ordered, later classes should override earlier ones
      expect(cn('bg-red-500 bg-blue-500')).toBe('bg-blue-500')
      expect(cn('text-sm text-lg')).toBe('text-lg')
      expect(cn('p-4 p-8')).toBe('p-8')
    })

    it('should handle Tailwind modifiers', () => {
      expect(cn(
        'hover:bg-blue-500',
        'focus:outline-none',
        'disabled:opacity-50',
        'sm:text-lg lg:text-xl',
        'dark:bg-gray-800'
      )).toBe(
        'hover:bg-blue-500 focus:outline-none disabled:opacity-50 sm:text-lg lg:text-xl dark:bg-gray-800'
      )
    })

    it('should handle arbitrary values', () => {
      expect(cn('w-[100px]', 'h-[50px]', 'grid-cols-[1fr,2fr]')).toBe(
        'w-[100px] h-[50px] grid-cols-[1fr,2fr]'
      )
    })

    it('should handle duplicate classes', () => {
      expect(cn('bg-red-500', 'bg-red-500', 'text-white', 'text-white')).toBe(
        'bg-red-500 text-white'
      )
    })

    it('should handle very long class strings', () => {
      const longClasses = ' '.repeat(100).split(' ').map((_, i) => `class-${i}`)
      const result = cn(...longClasses)

      expect(result).toBe(longClasses.join(' '))
    })

    it('should handle whitespace correctly', () => {
      expect(cn('  bg-red-500  ', '  text-white  ')).toBe('bg-red-500 text-white')
      expect(cn('bg-red-500\n\ttext-white')).toBe('bg-red-500 text-white')
    })

    it('should work with real-world component class scenarios', () => {
      // Button component classes
      expect(cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        'h-9 px-4 py-2'
      )).toContain('inline-flex items-center justify-center')
      expect(cn('inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2')).toContain('bg-primary')

      // Card component classes
      expect(cn(
        'rounded-lg border bg-card text-card-foreground shadow-sm',
        'p-6'
      )).toBe('rounded-lg border bg-card text-card-foreground shadow-sm p-6')

      // Input component classes
      expect(cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50'
      )).toContain('flex h-10 w-full rounded-md')
    })

    it('should handle edge cases gracefully', () => {
      // All falsy values
      expect(cn(false, null, undefined, 0, '', 'valid-class')).toBe('valid-class')

      // Numbers (should be converted to string)
      expect(cn(1, 2, 'string-class')).toBe('1 2 string-class')

      // Mixed complex case
      expect(cn(
        '',
        null,
        undefined,
        'base-class',
        ['array-class-1', ''],
        { 'object-class-1': true, 'object-class-2': false },
        false,
        'final-class'
      )).toBe('base-class array-class-1 object-class-1 final-class')
    })
  })

  describe('sanitizeIndexesForPersist function', () => {
    it('应该正确清理有效的索引数据', () => {
      const indexes: IndexDefinition[] = [
        {
          id: '1',
          name: 'idx_name',
          fields: [
            { name: 'field1', direction: 'ASC' },
            { name: 'field2', direction: 'DESC' }
          ],
          unique: true,
          isPrimary: false
        }
      ]

      const result = sanitizeIndexesForPersist(indexes)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        id: '1',
        name: 'idx_name',
        fields: [
          { name: 'field1', direction: 'ASC' },
          { name: 'field2', direction: 'DESC' }
        ],
        unique: true,
        isPrimary: false
      })
    })

    it('应该处理索引名称中的空格和空值', () => {
      const indexes: IndexDefinition[] = [
        {
          id: '1',
          name: ' idx_name ',
          fields: [{ name: 'field1', direction: 'ASC' }],
          unique: false,
          isPrimary: false
        },
        {
          id: '2',
          name: '',
          fields: [{ name: 'field2', direction: 'ASC' }],
          unique: false,
          isPrimary: false
        },
        {
          id: '3',
          name: null,
          fields: [{ name: 'field3', direction: 'ASC' }],
          unique: false,
          isPrimary: false
        }
      ]

      const result = sanitizeIndexesForPersist(indexes)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('idx_name')
    })

    it('应该处理字段名称中的空格和空值', () => {
      const indexes: IndexDefinition[] = [
        {
          id: '1',
          name: 'idx_name',
          fields: [
            { name: ' field1 ', direction: 'ASC' },
            { name: null, direction: 'DESC' },
            { name: undefined, direction: 'ASC' }
          ],
          unique: false,
          isPrimary: false
        }
      ]

      const result = sanitizeIndexesForPersist(indexes)

      expect(result).toHaveLength(1)
      expect(result[0].fields).toEqual([
        { name: 'field1', direction: 'ASC' },
        { name: '', direction: 'DESC' },
        { name: '', direction: 'ASC' }
      ])
    })

    it('应该为无效的排序方向设置默认值 ASC', () => {
      const indexes: IndexDefinition[] = [
        {
          id: '1',
          name: 'idx_name',
          fields: [
            { name: 'field1', direction: 'ASC' },
            { name: 'field2', direction: 'DESC' },
            { name: 'field3', direction: 'INVALID' as any },
            { name: 'field4', direction: null as any },
            { name: 'field5', direction: undefined as any }
          ],
          unique: false,
          isPrimary: false
        }
      ]

      const result = sanitizeIndexesForPersist(indexes)

      expect(result).toHaveLength(1)
      expect(result[0].fields).toEqual([
        { name: 'field1', direction: 'ASC' },
        { name: 'field2', direction: 'DESC' },
        { name: 'field3', direction: 'ASC' },
        { name: 'field4', direction: 'ASC' },
        { name: 'field5', direction: 'ASC' }
      ])
    })

    it('应该将 unique 和 isPrimary 转换为布尔值', () => {
      const indexes: IndexDefinition[] = [
        {
          id: '1',
          name: 'idx_name1',
          fields: [{ name: 'field1', direction: 'ASC' }],
          unique: 1 as any,
          isPrimary: 0 as any
        },
        {
          id: '2',
          name: 'idx_name2',
          fields: [{ name: 'field2', direction: 'ASC' }],
          unique: 'true' as any,
          isPrimary: 'false' as any
        },
        {
          id: '3',
          name: 'idx_name3',
          fields: [{ name: 'field3', direction: 'ASC' }],
          unique: null as any,
          isPrimary: undefined as any
        }
      ]

      const result = sanitizeIndexesForPersist(indexes)

      expect(result).toHaveLength(3)
      expect(result[0].unique).toBe(true)   // 1 转换为 true
      expect(result[0].isPrimary).toBe(false) // 0 转换为 false
      expect(result[1].unique).toBe(true)   // 'true' 转换为 true
      expect(result[1].isPrimary).toBe(true)   // 'false' 转换为 true (非空字符串)
      expect(result[2].unique).toBe(false)  // null 转换为 false
      expect(result[2].isPrimary).toBe(false)  // undefined 转换为 false
    })

    it('应该过滤掉没有字段的索引', () => {
      const indexes: IndexDefinition[] = [
        {
          id: '1',
          name: 'valid_index',
          fields: [{ name: 'field1', direction: 'ASC' }],
          unique: false,
          isPrimary: false
        },
        {
          id: '2',
          name: 'empty_fields',
          fields: [],
          unique: false,
          isPrimary: false
        }
      ]

      const result = sanitizeIndexesForPersist(indexes)

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('valid_index')
    })

    it('应该在 fields 为 null 时抛出错误', () => {
      const indexes: IndexDefinition[] = [
        {
          id: '1',
          name: 'null_fields',
          fields: null as any,
          unique: false,
          isPrimary: false
        }
      ]

      expect(() => sanitizeIndexesForPersist(indexes)).toThrow()
    })

    it('应该处理复杂的边界情况', () => {
      const indexes: IndexDefinition[] = [
        {
          id: '1',
          name: '  mixed_index  ',
          fields: [
            { name: '  valid_field  ', direction: 'ASC' },
            { name: '', direction: 'DESC' },
            { name: null, direction: 'INVALID' as any }
          ],
          unique: 'truthy' as any,
          isPrimary: 0 as any
        }
      ]

      const result = sanitizeIndexesForPersist(indexes)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        id: '1',
        name: 'mixed_index',
        fields: [
          { name: 'valid_field', direction: 'ASC' },
          { name: '', direction: 'DESC' },
          { name: '', direction: 'ASC' }
        ],
        unique: true,
        isPrimary: false
      })
    })

    it('应该处理空数组输入', () => {
      const result = sanitizeIndexesForPersist([])

      expect(result).toHaveLength(0)
      expect(Array.isArray(result)).toBe(true)
    })

    it('应该保持原有的 id 和其他属性不变', () => {
      const indexes: IndexDefinition[] = [
        {
          id: 'custom-id-123',
          name: 'test_index',
          fields: [{ name: 'field1', direction: 'ASC' }],
          unique: true,
          isPrimary: false
        }
      ]

      const result = sanitizeIndexesForPersist(indexes)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('custom-id-123')
    })
  })

  describe('createEmptyRow function', () => {
    it('应该创建正确结构的空行', () => {
      const result = createEmptyRow(1)

      expect(result).toEqual({
        order: 2,
        fieldName: '',
        fieldType: '',
        fieldComment: '',
        nullable: '是',
        defaultKind: '无',
        defaultValue: '',
        onUpdate: '无'
      })
    })

    it('应该根据索引设置正确的 order', () => {
      const row1 = createEmptyRow(0)
      const row2 = createEmptyRow(5)

      expect(row1.order).toBe(1)
      expect(row2.order).toBe(6)
    })
  })

  describe('ensureOrder function', () => {
    it('应该确保所有行的 order 值是连续的', () => {
      const rows: FieldRow[] = [
        { order: 1, fieldName: 'name1', fieldType: 'text', fieldComment: '', nullable: '是', defaultKind: '无', defaultValue: '', onUpdate: '无' },
        { order: 3, fieldName: 'name2', fieldType: 'int', fieldComment: '', nullable: '否', defaultKind: '无', defaultValue: '', onUpdate: '无' },
        { order: 2, fieldName: 'name3', fieldType: 'varchar', fieldComment: '', nullable: '是', defaultKind: '无', defaultValue: '', onUpdate: '无' }
      ]

      const result = ensureOrder(rows)

      expect(result).toHaveLength(3)
      expect(result[0].order).toBe(1)
      expect(result[1].order).toBe(2)
      expect(result[2].order).toBe(3)
      expect(result[0].fieldName).toBe('name1')
      expect(result[1].fieldName).toBe('name2')
      expect(result[2].fieldName).toBe('name3')
    })

    it('应该保持其他字段不变', () => {
      const rows: FieldRow[] = [
        { order: 1, fieldName: 'test', fieldType: 'int', fieldComment: 'comment', nullable: '否', defaultKind: '自增', defaultValue: '1', onUpdate: '无' }
      ]

      const result = ensureOrder(rows)

      expect(result[0]).toEqual({
        order: 1,
        fieldName: 'test',
        fieldType: 'int',
        fieldComment: 'comment',
        nullable: '否',
        defaultKind: '自增',
        defaultValue: '1',
        onUpdate: '无'
      })
    })
  })

  describe('sanitizeRowsForPersist function', () => {
    it('应该正确清理行数据用于持久化', () => {
      const rows: FieldRow[] = [
        {
          order: 1,
          fieldName: 'id',
          fieldType: 'int',
          fieldComment: 'Primary key',
          nullable: '否',
          defaultKind: '自增',
          defaultValue: '',
          onUpdate: '无'
        },
        {
          order: 2,
          fieldName: 'name',
          fieldType: 'varchar(255)',
          fieldComment: 'Name field',
          nullable: '是',
          defaultKind: '常量',
          defaultValue: 'test',
          onUpdate: '无'
        }
      ]

      const result = sanitizeRowsForPersist(rows)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        order: 1,
        fieldName: 'id',
        fieldType: 'int',
        fieldComment: 'Primary key',
        nullable: '否',
        defaultKind: '自增',
        defaultValue: '',
        onUpdate: '无'
      })
    })

    it('应该修正无效的 nullable 值', () => {
      const rows: FieldRow[] = [
        {
          order: 1,
          fieldName: 'test',
          fieldType: 'text',
          fieldComment: '',
          nullable: 'yes' as any, // 无效值
          defaultKind: '无',
          defaultValue: '',
          onUpdate: '无'
        }
      ]

      const result = sanitizeRowsForPersist(rows)

      expect(result[0].nullable).toBe('否')
    })

    it('应该修正无效的 defaultKind 和 onUpdate 值', () => {
      const rows: FieldRow[] = [
        {
          order: 1,
          fieldName: 'test',
          fieldType: 'text',
          fieldComment: '',
          nullable: '是',
          defaultKind: 'invalid' as any, // 无效值
          defaultValue: '',
          onUpdate: 'invalid' as any // 无效值
        }
      ]

      const result = sanitizeRowsForPersist(rows)

      expect(result[0].defaultKind).toBe('无')
      expect(result[0].onUpdate).toBe('无')
    })

    it('应该处理 null/undefined 值', () => {
      const rows: FieldRow[] = [
        {
          order: 1,
          fieldName: null as any,
          fieldType: undefined as any,
          fieldComment: null as any,
          nullable: null as any,
          defaultKind: null as any,
          defaultValue: null as any,
          onUpdate: null as any
        }
      ]

      const result = sanitizeRowsForPersist(rows)

      expect(result[0]).toEqual({
        order: 1,
        fieldName: '',
        fieldType: '',
        fieldComment: '',
        nullable: '否',
        defaultKind: null, // null 值会被保留，因为不在 DEFAULT_KIND_OPTIONS 中
        defaultValue: '',
        onUpdate: null // null 值会被保留，因为不在 ON_UPDATE_OPTIONS 中
      })
    })
  })

  describe('isIntegerType function', () => {
    it('应该正确识别整数类型', () => {
      expect(isIntegerType('tinyint')).toBe(true)
      expect(isIntegerType('smallint')).toBe(true)
      expect(isIntegerType('int')).toBe(true)
      expect(isIntegerType('integer')).toBe(true)
      expect(isIntegerType('bigint')).toBe(true)
    })

    it('应该识别非整数类型', () => {
      expect(isIntegerType('varchar')).toBe(false)
      expect(isIntegerType('decimal')).toBe(false)
      expect(isIntegerType('float')).toBe(false)
      expect(isIntegerType('text')).toBe(false)
    })
  })

  describe('isCharacterType function', () => {
    it('应该正确识别字符类型', () => {
      expect(isCharacterType('char')).toBe(true)
      expect(isCharacterType('varchar')).toBe(true)
      expect(isCharacterType('text')).toBe(true)
      expect(isCharacterType('nchar')).toBe(true)
      expect(isCharacterType('nvarchar')).toBe(true)
      expect(isCharacterType('longtext')).toBe(true)
      expect(isCharacterType('mediumtext')).toBe(true)
      expect(isCharacterType('tinytext')).toBe(true)
      expect(isCharacterType('clob')).toBe(true)
      expect(isCharacterType('varchar2')).toBe(true)
      expect(isCharacterType('nvarchar2')).toBe(true)
      expect(isCharacterType('uuid')).toBe(true)
    })

    it('应该识别非字符类型', () => {
      expect(isCharacterType('int')).toBe(false)
      expect(isCharacterType('decimal')).toBe(false)
      expect(isCharacterType('float')).toBe(false)
      expect(isCharacterType('timestamp')).toBe(false)
    })
  })

  describe('supportsUuidDefault function', () => {
    it('应该对字符类型支持 uuid 默认值', () => {
      expect(supportsUuidDefault('varchar')).toBe(true)
      expect(supportsUuidDefault('text')).toBe(true)
      expect(supportsUuidDefault('char')).toBe(true)
      expect(supportsUuidDefault('uuid')).toBe(true)
    })

    it('应该对非字符类型不支持 uuid 默认值', () => {
      expect(supportsUuidDefault('int')).toBe(false)
      expect(supportsUuidDefault('decimal')).toBe(false)
      expect(supportsUuidDefault('timestamp')).toBe(false)
    })
  })

  describe('getUiDefaultKindOptions function', () => {
    it('应该为支持自增的整数类型返回正确的选项', () => {
      const result = getUiDefaultKindOptions('mysql', 'int')
      expect(result).toContain('无')
      expect(result).toContain('自增')
      expect(result).toContain('常量')
      expect(result.length).toBeGreaterThanOrEqual(3)
    })

    it('应该为字符类型包含 uuid 选项', () => {
      const result = getUiDefaultKindOptions('mysql', 'varchar')
      expect(result).toContain('无')
      expect(result).toContain('常量')
      expect(result).toContain('uuid')
    })

    it('应该为支持时间戳的类型包含当前时间选项', () => {
      const result = getUiDefaultKindOptions('mysql', 'timestamp')
      expect(result).toContain('无')
      expect(result).toContain('常量')
      expect(result).toContain('当前时间')
    })

    it('应该为不支持的类型只返回基本选项', () => {
      const result = getUiDefaultKindOptions('mysql', 'float')
      expect(result).toEqual(['无', '常量'])
    })

    it('应该正确组合多个支持的选项', () => {
      const result = getUiDefaultKindOptions('postgresql', 'varchar')
      expect(result).toContain('无')
      expect(result).toContain('常量')
      expect(result).toContain('uuid')
      // PostgreSQL 的 varchar 类型不支持 "当前时间"，只有 timestamp 类型才支持
    })
  })

  describe('getUiOnUpdateOptions function', () => {
    it('应该为 MySQL timestamp 类型返回当前时间选项', () => {
      const result = getUiOnUpdateOptions('mysql', 'timestamp')
      expect(result).toEqual(['无', '当前时间'])
    })

    it('应兼容附带约束的时间戳类型', () => {
      const base = getCanonicalBaseType('timestamp(6) not null')
      const result = getUiOnUpdateOptions('mysql', base)
      expect(result).toEqual(['无', '当前时间'])
    })

    it('应该为 MySQL datetime 类型返回当前时间选项', () => {
      const result = getUiOnUpdateOptions('mysql', 'datetime')
      expect(result).toEqual(['无', '当前时间'])
    })

    it('应该为非 MySQL 数据库只返回无选项', () => {
      const result = getUiOnUpdateOptions('postgresql', 'timestamp')
      expect(result).toEqual(['无'])
    })

    it('应该为不支持的字段类型只返回无选项', () => {
      const result = getUiOnUpdateOptions('mysql', 'int')
      expect(result).toEqual(['无'])
    })
  })

  describe('Unknown database types', () => {
    it('应该对未知数据库类型不支持自增', () => {
      const result = getUiDefaultKindOptions('unknown_db' as any, 'int')
      expect(result).toEqual(['无', '常量']) // 不包含 '自增'
    })

    it('应该对未知数据库类型不支持当前时间默认值', () => {
      const result = getUiDefaultKindOptions('unknown_db' as any, 'timestamp')
      expect(result).toEqual(['无', '常量']) // 不包含 '当前时间'
    })

    it('应该对未知数据库类型不支持当前时间更新', () => {
      const result = getUiOnUpdateOptions('unknown_db' as any, 'timestamp')
      expect(result).toEqual(['无']) // 不包含 '当前时间'
    })
  })
})
