import { describe, it, expect } from 'vitest'
import type { FieldRow } from '@/App'
import {
  normalizeFields,
  normalizeBoolean,
  normalizeDefaultKind,
  normalizeOnUpdate,
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsOnUpdateCurrentTimestamp,
  isReservedKeyword,
  toStringSafe,
  escapeSingleQuotes,
  formatConstantDefault,
  shouldQuoteDefault,
  isLikelyFunctionOrKeyword,
  getCanonicalBaseType,
  splitQualifiedName,
  getSchemaAndTable,
  formatMysqlTableName,
  formatPostgresTableName,
  YES_VALUES,
  RESERVED_KEYWORDS
} from '@/App'

describe('Field Processing Functions', () => {
  describe('normalizeFields', () => {
    it('should normalize valid fields', () => {
      const input: FieldRow[] = [
        {
          order: 1,
          fieldName: 'id',
          fieldType: 'int',
          fieldComment: 'Primary key',
          nullable: '否',
          defaultKind: '自增',
          defaultValue: '',
          onUpdate: '无',
        },
        {
          order: 2,
          fieldName: 'name',
          fieldType: 'varchar(255)',
          fieldComment: 'Name field',
          nullable: '是',
          defaultKind: '无',
          defaultValue: '',
          onUpdate: '无',
        },
      ]

      const result = normalizeFields(input)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        name: 'id',
        type: 'int',
        comment: 'Primary key',
        nullable: false,
        defaultKind: 'auto_increment',
        defaultValue: '',
        onUpdate: 'none',
      })
      expect(result[1]).toEqual({
        name: 'name',
        type: 'varchar(255)',
        comment: 'Name field',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      })
    })

    it('should filter out fields with empty name or type', () => {
      const input: FieldRow[] = [
        {
          order: 1,
          fieldName: 'id',
          fieldType: 'int',
          fieldComment: 'Valid field',
          nullable: '否',
          defaultKind: '无',
          defaultValue: '',
          onUpdate: '无',
        },
        {
          order: 2,
          fieldName: '',
          fieldType: 'varchar(255)',
          fieldComment: 'Empty name',
          nullable: '是',
          defaultKind: '无',
          defaultValue: '',
          onUpdate: '无',
        },
        {
          order: 3,
          fieldName: 'invalid',
          fieldType: '',
          fieldComment: 'Empty type',
          nullable: '是',
          defaultKind: '无',
          defaultValue: '',
          onUpdate: '无',
        },
        {
          order: 4,
          fieldName: 'valid',
          fieldType: 'text',
          fieldComment: 'Another valid field',
          nullable: '是',
          defaultKind: '无',
          defaultValue: '',
          onUpdate: '无',
        },
      ]

      const result = normalizeFields(input)

      expect(result).toHaveLength(2)
      expect(result.map(f => f.name)).toEqual(['id', 'valid'])
    })

    it('should handle whitespace trimming', () => {
      const input: FieldRow[] = [
        {
          order: 1,
          fieldName: '  name  ',
          fieldType: '  varchar(255)  ',
          fieldComment: '  comment  ',
          nullable: ' 是 ',
          defaultKind: ' 无 ',
          defaultValue: '  default  ',
          onUpdate: ' 无 ',
        },
      ]

      const result = normalizeFields(input)

      expect(result[0]).toEqual({
        name: 'name',
        type: 'varchar(255)',
        comment: 'comment',
        nullable: true,
        defaultKind: 'none',
        defaultValue: 'default',
        onUpdate: 'none',
      })
    })
  })

  describe('normalizeBoolean', () => {
    it('should normalize yes-like values to true', () => {
      expect(normalizeBoolean('y')).toBe(true)
      expect(normalizeBoolean('yes')).toBe(true)
      expect(normalizeBoolean('true')).toBe(true)
      expect(normalizeBoolean('1')).toBe(true)
      expect(normalizeBoolean('是')).toBe(true)
      expect(normalizeBoolean('√')).toBe(true)
      expect(normalizeBoolean('Y')).toBe(true)
      expect(normalizeBoolean('YES')).toBe(true)
      expect(normalizeBoolean('TRUE')).toBe(true)
    })

    it('should normalize no-like values to false', () => {
      expect(normalizeBoolean('n')).toBe(false)
      expect(normalizeBoolean('no')).toBe(false)
      expect(normalizeBoolean('false')).toBe(false)
      expect(normalizeBoolean('0')).toBe(false)
      expect(normalizeBoolean('否')).toBe(false)
      expect(normalizeBoolean('')).toBe(false)
      expect(normalizeBoolean(null as any)).toBe(false)
      expect(normalizeBoolean(undefined as any)).toBe(false)
    })
  })

  describe('normalizeDefaultKind', () => {
    it('should normalize UI default kinds to internal values', () => {
      expect(normalizeDefaultKind('自增')).toBe('auto_increment')
      expect(normalizeDefaultKind('常量')).toBe('constant')
      expect(normalizeDefaultKind('当前时间')).toBe('current_timestamp')
      expect(normalizeDefaultKind('无')).toBe('none')
      expect(normalizeDefaultKind('')).toBe('none')
      expect(normalizeDefaultKind(undefined)).toBe('none')
      expect(normalizeDefaultKind('invalid')).toBe('none')
    })
  })

  describe('normalizeOnUpdate', () => {
    it('should normalize UI update kinds to internal values', () => {
      expect(normalizeOnUpdate('当前时间')).toBe('current_timestamp')
      expect(normalizeOnUpdate('无')).toBe('none')
      expect(normalizeOnUpdate('')).toBe('none')
      expect(normalizeOnUpdate(undefined)).toBe('none')
      expect(normalizeOnUpdate('invalid')).toBe('none')
    })
  })

  describe('supportsAutoIncrement', () => {
    it('should correctly identify auto increment support', () => {
      // MySQL
      expect(supportsAutoIncrement('mysql', 'int')).toBe(true)
      expect(supportsAutoIncrement('mysql', 'bigint')).toBe(true)
      expect(supportsAutoIncrement('mysql', 'tinyint')).toBe(true)
      expect(supportsAutoIncrement('mysql', 'smallint')).toBe(true)
      expect(supportsAutoIncrement('mysql', 'varchar')).toBe(false)

      // PostgreSQL
      expect(supportsAutoIncrement('postgresql', 'int')).toBe(true)
      expect(supportsAutoIncrement('postgresql', 'smallint')).toBe(true)
      expect(supportsAutoIncrement('postgresql', 'bigint')).toBe(true)
      expect(supportsAutoIncrement('postgresql', 'tinyint')).toBe(false)
      expect(supportsAutoIncrement('postgresql', 'varchar')).toBe(false)

      // SQL Server
      expect(supportsAutoIncrement('sqlserver', 'int')).toBe(true)
      expect(supportsAutoIncrement('sqlserver', 'tinyint')).toBe(true)
      expect(supportsAutoIncrement('sqlserver', 'smallint')).toBe(true)
      expect(supportsAutoIncrement('sqlserver', 'bigint')).toBe(true)
      expect(supportsAutoIncrement('sqlserver', 'varchar')).toBe(false)

      // Oracle
      expect(supportsAutoIncrement('oracle', 'int')).toBe(true)
      expect(supportsAutoIncrement('oracle', 'decimal')).toBe(true)
      expect(supportsAutoIncrement('oracle', 'number')).toBe(true)
      expect(supportsAutoIncrement('oracle', 'varchar')).toBe(false)
    })
  })

  describe('supportsDefaultCurrentTimestamp', () => {
    it('should correctly identify timestamp default support', () => {
      // MySQL
      expect(supportsDefaultCurrentTimestamp('mysql', 'timestamp')).toBe(true)
      expect(supportsDefaultCurrentTimestamp('mysql', 'datetime')).toBe(true)
      expect(supportsDefaultCurrentTimestamp('mysql', 'varchar')).toBe(false)

      // PostgreSQL
      expect(supportsDefaultCurrentTimestamp('postgresql', 'timestamp')).toBe(true)
      expect(supportsDefaultCurrentTimestamp('postgresql', 'timestamptz')).toBe(true)
      expect(supportsDefaultCurrentTimestamp('postgresql', 'varchar')).toBe(false)

      // SQL Server
      expect(supportsDefaultCurrentTimestamp('sqlserver', 'datetime')).toBe(true)
      expect(supportsDefaultCurrentTimestamp('sqlserver', 'datetime2')).toBe(true)
      expect(supportsDefaultCurrentTimestamp('sqlserver', 'varchar')).toBe(false)

      // Oracle
      expect(supportsDefaultCurrentTimestamp('oracle', 'timestamp')).toBe(true)
      expect(supportsDefaultCurrentTimestamp('oracle', 'varchar')).toBe(false)
    })
  })

  describe('supportsOnUpdateCurrentTimestamp', () => {
    it('should only support MySQL timestamp on update', () => {
      expect(supportsOnUpdateCurrentTimestamp('mysql', 'timestamp')).toBe(true)
      expect(supportsOnUpdateCurrentTimestamp('mysql', 'datetime')).toBe(true)
      expect(supportsOnUpdateCurrentTimestamp('postgresql', 'timestamp')).toBe(false)
      expect(supportsOnUpdateCurrentTimestamp('sqlserver', 'datetime')).toBe(false)
      expect(supportsOnUpdateCurrentTimestamp('oracle', 'timestamp')).toBe(false)
    })
  })

  describe('isReservedKeyword', () => {
    it('should correctly identify reserved keywords', () => {
      // MySQL keywords
      expect(isReservedKeyword('mysql', 'table')).toBe(true)
      expect(isReservedKeyword('mysql', 'select')).toBe(true)
      expect(isReservedKeyword('mysql', 'create')).toBe(true)
      expect(isReservedKeyword('mysql', 'not_reserved')).toBe(false)

      // PostgreSQL keywords
      expect(isReservedKeyword('postgresql', 'table')).toBe(true)
      expect(isReservedKeyword('postgresql', 'select')).toBe(true)
      expect(isReservedKeyword('postgresql', 'with')).toBe(true)
      expect(isReservedKeyword('postgresql', 'not_reserved')).toBe(false)

      // SQL Server keywords
      expect(isReservedKeyword('sqlserver', 'table')).toBe(true)
      expect(isReservedKeyword('sqlserver', 'select')).toBe(true)
      expect(isReservedKeyword('sqlserver', 'procedure')).toBe(true)
      expect(isReservedKeyword('sqlserver', 'not_reserved')).toBe(false)

      // Oracle keywords
      expect(isReservedKeyword('oracle', 'table')).toBe(true)
      expect(isReservedKeyword('oracle', 'select')).toBe(true)
      expect(isReservedKeyword('oracle', 'synonym')).toBe(true)
      expect(isReservedKeyword('oracle', 'not_reserved')).toBe(false)
    })

    it('should handle case insensitive matching', () => {
      expect(isReservedKeyword('mysql', 'TABLE')).toBe(true)
      expect(isReservedKeyword('mysql', 'Select')).toBe(true)
      expect(isReservedKeyword('mysql', 'CREATE')).toBe(true)
    })

    it('should handle whitespace and empty strings', () => {
      expect(isReservedKeyword('mysql', '')).toBe(false)
      expect(isReservedKeyword('mysql', '   ')).toBe(false)
      expect(isReservedKeyword('mysql', ' table ')).toBe(true) // table is a keyword regardless of whitespace
    })
  })

  describe('toStringSafe', () => {
    it('should safely convert values to strings', () => {
      expect(toStringSafe('hello')).toBe('hello')
      expect(toStringSafe(123)).toBe('123')
      expect(toStringSafe(true)).toBe('true')
      expect(toStringSafe(null)).toBe('')
      expect(toStringSafe(undefined)).toBe('')
      expect(toStringSafe({})).toBe('[object Object]')
    })
  })

  describe('escapeSingleQuotes', () => {
    it('should escape single quotes for SQL', () => {
      expect(escapeSingleQuotes("O'Reilly")).toBe("O''Reilly")
      expect(escapeSingleQuotes("It's a test")).toBe("It''s a test")
      expect(escapeSingleQuotes("''multiple''quotes''")).toBe("''''multiple''''quotes''''")
      expect(escapeSingleQuotes('no quotes')).toBe('no quotes')
      expect(escapeSingleQuotes('')).toBe('')
    })
  })

  describe('formatConstantDefault', () => {
    it('should format constant defaults correctly', () => {
      // Text-like types should be quoted
      expect(formatConstantDefault('varchar', 'test')).toBe(" DEFAULT 'test'")
      expect(formatConstantDefault('text', 'hello world')).toBe(" DEFAULT 'hello world'")
      expect(formatConstantDefault('char', "O'Reilly")).toBe(" DEFAULT 'O''Reilly'")
      expect(formatConstantDefault('date', '2023-01-01')).toBe(" DEFAULT '2023-01-01'")
      expect(formatConstantDefault('timestamp', '2023-01-01 12:00:00')).toBe(" DEFAULT '2023-01-01 12:00:00'")

      // Numeric types should not be quoted
      expect(formatConstantDefault('int', '123')).toBe(' DEFAULT 123')
      expect(formatConstantDefault('decimal', '123.45')).toBe(' DEFAULT 123.45')
      expect(formatConstantDefault('float', '12.34')).toBe(' DEFAULT 12.34')

      // Function-like keywords should not be quoted
      expect(formatConstantDefault('varchar', 'CURRENT_TIMESTAMP')).toBe(' DEFAULT CURRENT_TIMESTAMP')
      expect(formatConstantDefault('varchar', 'UUID()')).toBe(' DEFAULT UUID()')
      expect(formatConstantDefault('varchar', 'GEN_RANDOM_UUID()')).toBe(' DEFAULT GEN_RANDOM_UUID()')

      // Empty value should return empty string
      expect(formatConstantDefault('varchar', '')).toBe('')
      expect(formatConstantDefault('varchar', '   ')).toBe('')
    })
  })

  describe('shouldQuoteDefault', () => {
    it('should identify types that need quoting', () => {
      expect(shouldQuoteDefault('varchar')).toBe(true)
      expect(shouldQuoteDefault('nvarchar')).toBe(true)
      expect(shouldQuoteDefault('char')).toBe(true)
      expect(shouldQuoteDefault('nchar')).toBe(true)
      expect(shouldQuoteDefault('text')).toBe(true)
      expect(shouldQuoteDefault('mediumtext')).toBe(true)
      expect(shouldQuoteDefault('longtext')).toBe(true)
      expect(shouldQuoteDefault('uuid')).toBe(true)
      expect(shouldQuoteDefault('xml')).toBe(true)
      expect(shouldQuoteDefault('json')).toBe(true)
      expect(shouldQuoteDefault('jsonb')).toBe(false)
      expect(shouldQuoteDefault('clob')).toBe(true)
      expect(shouldQuoteDefault('varchar2')).toBe(true)
      expect(shouldQuoteDefault('nvarchar2')).toBe(true)
      expect(shouldQuoteDefault('date')).toBe(true)
      expect(shouldQuoteDefault('time')).toBe(true)
      expect(shouldQuoteDefault('timestamp')).toBe(true)
      expect(shouldQuoteDefault('datetime')).toBe(true)
      expect(shouldQuoteDefault('datetime2')).toBe(true)
      expect(shouldQuoteDefault('timetz')).toBe(true)
      expect(shouldQuoteDefault('timestamptz')).toBe(true)

      expect(shouldQuoteDefault('int')).toBe(false)
      expect(shouldQuoteDefault('bigint')).toBe(false)
      expect(shouldQuoteDefault('decimal')).toBe(false)
      expect(shouldQuoteDefault('float')).toBe(false)
      expect(shouldQuoteDefault('double')).toBe(false)
      expect(shouldQuoteDefault('real')).toBe(false)
      expect(shouldQuoteDefault('boolean')).toBe(false)
      expect(shouldQuoteDefault('bit')).toBe(false)
    })
  })

  describe('isLikelyFunctionOrKeyword', () => {
    it('should identify functions and keywords', () => {
      expect(isLikelyFunctionOrKeyword('CURRENT_TIMESTAMP')).toBe(true)
      expect(isLikelyFunctionOrKeyword('UUID()')).toBe(true)
      expect(isLikelyFunctionOrKeyword('NOW()')).toBe(true)
      expect(isLikelyFunctionOrKeyword('GETDATE()')).toBe(true)
      expect(isLikelyFunctionOrKeyword('SYSTIMESTAMP')).toBe(true)
      expect(isLikelyFunctionOrKeyword('DEFAULT_VALUE')).toBe(true)
      expect(isLikelyFunctionOrKeyword('nextval')).toBe(false)
      expect(isLikelyFunctionOrKeyword('gen_random_uuid')).toBe(false)

      expect(isLikelyFunctionOrKeyword('simple text')).toBe(false)
      expect(isLikelyFunctionOrKeyword('123')).toBe(false)
      expect(isLikelyFunctionOrKeyword('123.45')).toBe(false)
      expect(isLikelyFunctionOrKeyword('not_a_function')).toBe(false)
      expect(isLikelyFunctionOrKeyword('')).toBe(false)
    })
  })

  describe('getCanonicalBaseType', () => {
    it('should get canonical base type from raw type', () => {
      expect(getCanonicalBaseType('varchar')).toBe('varchar')
      expect(getCanonicalBaseType('VARCHAR')).toBe('varchar')
      expect(getCanonicalBaseType('varchar(255)')).toBe('varchar')
      expect(getCanonicalBaseType('int unsigned')).toBe('int')
      expect(getCanonicalBaseType('character varying(100)')).toBe('varchar')
      expect(getCanonicalBaseType('')).toBe('')
      expect(getCanonicalBaseType('   ')).toBe('')
      expect(getCanonicalBaseType('timestamp(6) not null')).toBe('timestamp')
      expect(getCanonicalBaseType('timestamp default current_timestamp')).toBe('timestamp')
      expect(getCanonicalBaseType('time with time zone')).toBe('timetz')
    })
  })

  describe('Table Name Processing', () => {
    describe('splitQualifiedName', () => {
      it('should split qualified names', () => {
        expect(splitQualifiedName('table')).toEqual(['table'])
        expect(splitQualifiedName('schema.table')).toEqual(['schema', 'table'])
        expect(splitQualifiedName('db.schema.table')).toEqual(['db', 'schema', 'table'])
        expect(splitQualifiedName('db.schema.table_name')).toEqual(['db', 'schema', 'table_name'])
        expect(splitQualifiedName('schema . table')).toEqual(['schema', 'table'])
        expect(splitQualifiedName('')).toEqual([])
        expect(splitQualifiedName('   ')).toEqual([])
      })
    })

    describe('getSchemaAndTable', () => {
      it('should extract schema and table from qualified names', () => {
        expect(getSchemaAndTable('table')).toEqual({ schema: '', table: 'table' })
        expect(getSchemaAndTable('schema.table')).toEqual({ schema: 'schema', table: 'table' })
        expect(getSchemaAndTable('db.schema.table')).toEqual({ schema: 'db.schema', table: 'table' })
        expect(getSchemaAndTable('  schema.table  ')).toEqual({ schema: 'schema', table: 'table' })
        expect(getSchemaAndTable('')).toEqual({ schema: '', table: '' })
        expect(getSchemaAndTable('   ')).toEqual({ schema: '', table: '' })
      })
    })

    describe('formatMysqlTableName', () => {
      it('should format MySQL table names', () => {
        expect(formatMysqlTableName('table')).toBe('table')
        expect(formatMysqlTableName('schema.table')).toBe('schema.table')
        expect(formatMysqlTableName('db.schema.table')).toBe('db.schema.table')
        expect(formatMysqlTableName('  table  ')).toBe('table')
        expect(formatMysqlTableName('')).toBe('')
        expect(formatMysqlTableName('   ')).toBe('')
      })
    })

    describe('formatPostgresTableName', () => {
      it('should format PostgreSQL table names', () => {
        expect(formatPostgresTableName('table')).toBe('table')
        expect(formatPostgresTableName('schema.table')).toBe('schema.table')
        expect(formatPostgresTableName('db.schema.table')).toBe('db.schema.table')
        expect(formatPostgresTableName('  table  ')).toBe('table')
        expect(formatPostgresTableName('')).toBe('')
        expect(formatPostgresTableName('   ')).toBe('')
      })
    })
  })

  describe('Constants', () => {
    describe('YES_VALUES', () => {
      it('should contain all expected yes-like values', () => {
        expect(YES_VALUES.has('y')).toBe(true)
        expect(YES_VALUES.has('yes')).toBe(true)
        expect(YES_VALUES.has('true')).toBe(true)
        expect(YES_VALUES.has('1')).toBe(true)
        expect(YES_VALUES.has('是')).toBe(true)
        expect(YES_VALUES.has('√')).toBe(true)
        expect(YES_VALUES.has('no')).toBe(false)
        expect(YES_VALUES.has('false')).toBe(false)
      })
    })

    describe('RESERVED_KEYWORDS', () => {
      it('should contain keywords for all databases', () => {
        expect(RESERVED_KEYWORDS.mysql).toBeInstanceOf(Set)
        expect(RESERVED_KEYWORDS.postgresql).toBeInstanceOf(Set)
        expect(RESERVED_KEYWORDS.sqlserver).toBeInstanceOf(Set)
        expect(RESERVED_KEYWORDS.oracle).toBeInstanceOf(Set)

        // Check some common keywords
        expect(RESERVED_KEYWORDS.mysql.has('table')).toBe(true)
        expect(RESERVED_KEYWORDS.postgresql.has('table')).toBe(true)
        expect(RESERVED_KEYWORDS.sqlserver.has('table')).toBe(true)
        expect(RESERVED_KEYWORDS.oracle.has('table')).toBe(true)

        // Oracle-specific keyword
        expect(RESERVED_KEYWORDS.oracle.has('synonym')).toBe(true)
        expect(RESERVED_KEYWORDS.mysql.has('synonym')).toBe(false)
      })
    })
  })
})
