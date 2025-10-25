import { describe, it, expect } from 'vitest'
import {
  parseFieldType,
  canonicalizeBaseType,
  getFieldTypeForDatabase,
  TYPE_ALIASES
} from '@/App'

describe('Type Mapping Functions', () => {
  describe('parseFieldType', () => {
    it('should parse basic types', () => {
      expect(parseFieldType('varchar')).toEqual({
        baseType: 'varchar',
        args: [],
        unsigned: false,
        raw: 'varchar',
      })

      expect(parseFieldType('int')).toEqual({
        baseType: 'int',
        args: [],
        unsigned: false,
        raw: 'int',
      })
    })

    it('should parse types with arguments', () => {
      expect(parseFieldType('varchar(255)')).toEqual({
        baseType: 'varchar',
        args: ['255'],
        unsigned: false,
        raw: 'varchar(255)',
      })

      expect(parseFieldType('decimal(10,2)')).toEqual({
        baseType: 'decimal',
        args: ['10', '2'],
        unsigned: false,
        raw: 'decimal(10,2)',
      })

      expect(parseFieldType('varchar( MAX )')).toEqual({
        baseType: 'varchar',
        args: ['max'],
        unsigned: false,
        raw: 'varchar( MAX )',
      })
    })

    it('should parse unsigned types', () => {
      expect(parseFieldType('int unsigned')).toEqual({
        baseType: 'int',
        args: [],
        unsigned: true,
        raw: 'int unsigned',
      })

      expect(parseFieldType('decimal(10,2) unsigned')).toEqual({
        baseType: 'decimal',
        args: ['10', '2'],
        unsigned: true,
        raw: 'decimal(10,2) unsigned',
      })
    })

    it('should handle unsigned at end of baseType', () => {
      expect(parseFieldType('unsigned int')).toEqual({
        baseType: 'unsigned int',
        args: [],
        unsigned: false,
        raw: 'unsigned int',
      })
    })

    it('should parse complex types', () => {
      expect(parseFieldType('character varying(255)')).toEqual({
        baseType: 'character varying',
        args: ['255'],
        unsigned: false,
        raw: 'character varying(255)',
      })

      expect(parseFieldType('time with time zone')).toEqual({
        baseType: 'time with time zone',
        args: [],
        unsigned: false,
        raw: 'time with time zone',
      })
    })

    it('should handle empty and invalid input', () => {
      expect(parseFieldType('')).toEqual({
        baseType: '',
        args: [],
        unsigned: false,
        raw: '',
      })

      expect(parseFieldType('   ')).toEqual({
        baseType: '',
        args: [],
        unsigned: false,
        raw: '',
      })

      expect(parseFieldType('()')).toEqual({
        baseType: '',
        args: [],
        unsigned: false,
        raw: '()',
      })
    })

    it('should handle malformed parentheses', () => {
      expect(parseFieldType('varchar(255)')).toEqual({
        baseType: 'varchar',
        args: ['255'],
        unsigned: false,
        raw: 'varchar(255)',
      })

      expect(parseFieldType('varchar255)')).toEqual({
        baseType: 'varchar255',
        args: [],
        unsigned: false,
        raw: 'varchar255)',
      })
    })
  })

  describe('canonicalizeBaseType', () => {
    it('should return original type if not in aliases', () => {
      expect(canonicalizeBaseType('unknown_type')).toBe('unknown_type')
      expect(canonicalizeBaseType('custom123')).toBe('custom123')
    })

    it('should map common aliases', () => {
      expect(canonicalizeBaseType('VARCHAR')).toBe('VARCHAR')
      expect(canonicalizeBaseType('INT')).toBe('INT')
      expect(canonicalizeBaseType('INTEGER')).toBe('INTEGER')
      expect(canonicalizeBaseType('TEXT')).toBe('TEXT')
      expect(canonicalizeBaseType('NUMBER')).toBe('NUMBER')
      expect(canonicalizeBaseType('NVARCHAR')).toBe('NVARCHAR')
      expect(canonicalizeBaseType('NVARCHAR2')).toBe('NVARCHAR2')
      expect(canonicalizeBaseType('VARCHAR2')).toBe('VARCHAR2')
    })

    it('should handle case insensitive mapping', () => {
      expect(canonicalizeBaseType('Varchar')).toBe('Varchar')
      expect(canonicalizeBaseType('INT')).toBe('INT')
      expect(canonicalizeBaseType('Boolean')).toBe('Boolean')
    })

    it('should map complex type aliases', () => {
      expect(canonicalizeBaseType('character varying')).toBe('varchar')
      expect(canonicalizeBaseType('national character varying')).toBe('nvarchar')
      expect(canonicalizeBaseType('double precision')).toBe('double')
      expect(canonicalizeBaseType('timestamp without time zone')).toBe('timestamp')
      expect(canonicalizeBaseType('timestamp with time zone')).toBe('timestamp with time zone')
    })
  })

  describe('TYPE_ALIASES', () => {
    it('should contain all expected aliases', () => {
      expect(TYPE_ALIASES['varchar']).toBe('varchar')
      expect(TYPE_ALIASES['int']).toBe('int')
      expect(TYPE_ALIASES['integer']).toBe('int')
      expect(TYPE_ALIASES['bigint']).toBe('bigint')
      expect(TYPE_ALIASES['text']).toBe('text')
      expect(TYPE_ALIASES['number']).toBe('decimal')
      expect(TYPE_ALIASES['numeric']).toBe('decimal')
      expect(TYPE_ALIASES['real']).toBe('real')
      expect(TYPE_ALIASES['double']).toBe('double')
      expect(TYPE_ALIASES['float']).toBe('float')
      expect(TYPE_ALIASES['boolean']).toBe('boolean')
      expect(TYPE_ALIASES['uuid']).toBe('uuid')
      expect(TYPE_ALIASES['json']).toBe('json')
      expect(TYPE_ALIASES['jsonb']).toBe('jsonb')
      expect(TYPE_ALIASES['xml']).toBe('xml')
      expect(TYPE_ALIASES['blob']).toBe('blob')
      expect(TYPE_ALIASES['clob']).toBe('text')
    })
  })

  describe('getFieldTypeForDatabase', () => {
    describe('MySQL type mapping', () => {
      it('should map varchar types', () => {
        expect(getFieldTypeForDatabase('mysql', 'varchar')).toBe('VARCHAR(255)')
        expect(getFieldTypeForDatabase('mysql', 'varchar(100)')).toBe('VARCHAR(100)')
        expect(getFieldTypeForDatabase('mysql', 'nvarchar')).toBe('VARCHAR(255)')
        expect(getFieldTypeForDatabase('mysql', 'nvarchar(50)')).toBe('VARCHAR(50)')
      })

      it('should map integer types', () => {
        expect(getFieldTypeForDatabase('mysql', 'int')).toBe('INT')
        expect(getFieldTypeForDatabase('mysql', 'int unsigned')).toBe('INT UNSIGNED')
        expect(getFieldTypeForDatabase('mysql', 'tinyint')).toBe('TINYINT(1)')
        expect(getFieldTypeForDatabase('mysql', 'tinyint(8)')).toBe('TINYINT(8)')
        expect(getFieldTypeForDatabase('mysql', 'tinyint unsigned')).toBe('TINYINT(1) UNSIGNED')
        expect(getFieldTypeForDatabase('mysql', 'smallint')).toBe('SMALLINT')
        expect(getFieldTypeForDatabase('mysql', 'bigint')).toBe('BIGINT')
        expect(getFieldTypeForDatabase('mysql', 'bigint unsigned')).toBe('BIGINT UNSIGNED')
      })

      it('should map decimal types', () => {
        expect(getFieldTypeForDatabase('mysql', 'decimal')).toBe('DECIMAL(18, 2)')
        expect(getFieldTypeForDatabase('mysql', 'decimal(10,3)')).toBe('DECIMAL(10, 3)')
        expect(getFieldTypeForDatabase('mysql', 'decimal(5)')).toBe('DECIMAL(5)')
        expect(getFieldTypeForDatabase('mysql', 'decimal unsigned')).toBe('DECIMAL(18, 2) UNSIGNED')
      })

      it('should map text types', () => {
        expect(getFieldTypeForDatabase('mysql', 'text')).toBe('TEXT')
        expect(getFieldTypeForDatabase('mysql', 'mediumtext')).toBe('MEDIUMTEXT')
        expect(getFieldTypeForDatabase('mysql', 'longtext')).toBe('LONGTEXT')
        expect(getFieldTypeForDatabase('mysql', 'clob')).toBe('TEXT')
      })

      it('should map date/time types', () => {
        expect(getFieldTypeForDatabase('mysql', 'date')).toBe('DATE')
        expect(getFieldTypeForDatabase('mysql', 'datetime')).toBe('DATETIME')
        expect(getFieldTypeForDatabase('mysql', 'datetime(6)')).toBe('DATETIME(6)')
        expect(getFieldTypeForDatabase('mysql', 'timestamp')).toBe('TIMESTAMP')
        expect(getFieldTypeForDatabase('mysql', 'timestamp(6)')).toBe('TIMESTAMP')
        expect(getFieldTypeForDatabase('mysql', 'time')).toBe('TIME')
        expect(getFieldTypeForDatabase('mysql', 'datetime2')).toBe('DATETIME')
      })

      it('should map JSON and binary types', () => {
        expect(getFieldTypeForDatabase('mysql', 'json')).toBe('JSON')
        expect(getFieldTypeForDatabase('mysql', 'jsonb')).toBe('JSON')
        expect(getFieldTypeForDatabase('mysql', 'blob')).toBe('BLOB')
        expect(getFieldTypeForDatabase('mysql', 'varbinary')).toBe('VARBINARY')
        expect(getFieldTypeForDatabase('mysql', 'varbinary(100)')).toBe('VARBINARY(100)')
        expect(getFieldTypeForDatabase('mysql', 'varbinary(max)')).toBe('VARBINARY(MAX)')
      })

      it('should map other common types', () => {
        expect(getFieldTypeForDatabase('mysql', 'boolean')).toBe('TINYINT(1)')
        expect(getFieldTypeForDatabase('mysql', 'bit')).toBe('BIT(1)')
        expect(getFieldTypeForDatabase('mysql', 'bit(8)')).toBe('BIT(8)')
        expect(getFieldTypeForDatabase('mysql', 'uuid')).toBe('CHAR(36)')
        expect(getFieldTypeForDatabase('mysql', 'float')).toBe('FLOAT')
        expect(getFieldTypeForDatabase('mysql', 'double')).toBe('DOUBLE')
        expect(getFieldTypeForDatabase('mysql', 'real')).toBe('DOUBLE')
        expect(getFieldTypeForDatabase('mysql', 'serial')).toBe('BIGINT UNSIGNED AUTO_INCREMENT')
      })

      it('should return original type for unknown types', () => {
        expect(getFieldTypeForDatabase('mysql', 'unknown_type')).toBe('unknown_type')
        expect(getFieldTypeForDatabase('mysql', 'custom123')).toBe('custom123')
      })
    })

    describe('PostgreSQL type mapping', () => {
      it('should map character types', () => {
        expect(getFieldTypeForDatabase('postgresql', 'varchar')).toBe('VARCHAR')
        expect(getFieldTypeForDatabase('postgresql', 'varchar(100)')).toBe('VARCHAR(100)')
        expect(getFieldTypeForDatabase('postgresql', 'char')).toBe('CHAR')
        expect(getFieldTypeForDatabase('postgresql', 'char(10)')).toBe('CHAR(10)')
        expect(getFieldTypeForDatabase('postgresql', 'nvarchar')).toBe('VARCHAR')
        expect(getFieldTypeForDatabase('postgresql', 'nchar')).toBe('CHAR')
        expect(getFieldTypeForDatabase('postgresql', 'character varying')).toBe('VARCHAR')
      })

      it('should map integer types', () => {
        expect(getFieldTypeForDatabase('postgresql', 'int')).toBe('INTEGER')
        expect(getFieldTypeForDatabase('postgresql', 'integer')).toBe('INTEGER')
        expect(getFieldTypeForDatabase('postgresql', 'tinyint')).toBe('SMALLINT')
        expect(getFieldTypeForDatabase('postgresql', 'smallint')).toBe('SMALLINT')
        expect(getFieldTypeForDatabase('postgresql', 'bigint')).toBe('BIGINT')
        expect(getFieldTypeForDatabase('postgresql', 'serial')).toBe('SERIAL')
      })

      it('should map decimal types', () => {
        expect(getFieldTypeForDatabase('postgresql', 'decimal')).toBe('NUMERIC(18, 2)')
        expect(getFieldTypeForDatabase('postgresql', 'decimal(10,3)')).toBe('NUMERIC(10, 3)')
        expect(getFieldTypeForDatabase('postgresql', 'number')).toBe('NUMERIC(18, 2)')
        expect(getFieldTypeForDatabase('postgresql', 'numeric')).toBe('NUMERIC(18, 2)')
      })

      it('should map date/time types', () => {
        expect(getFieldTypeForDatabase('postgresql', 'date')).toBe('DATE')
        expect(getFieldTypeForDatabase('postgresql', 'time')).toBe('TIME WITHOUT TIME ZONE')
        expect(getFieldTypeForDatabase('postgresql', 'timetz')).toBe('TIME WITH TIME ZONE')
        expect(getFieldTypeForDatabase('postgresql', 'timestamp')).toBe('TIMESTAMP')
        expect(getFieldTypeForDatabase('postgresql', 'timestamptz')).toBe('TIMESTAMP WITH TIME ZONE')
        expect(getFieldTypeForDatabase('postgresql', 'datetime')).toBe('TIMESTAMP')
        expect(getFieldTypeForDatabase('postgresql', 'time with time zone')).toBe('TIME WITH TIME ZONE')
      })

      it('should map text types', () => {
        expect(getFieldTypeForDatabase('postgresql', 'text')).toBe('TEXT')
        expect(getFieldTypeForDatabase('postgresql', 'mediumtext')).toBe('TEXT')
        expect(getFieldTypeForDatabase('postgresql', 'longtext')).toBe('TEXT')
        expect(getFieldTypeForDatabase('postgresql', 'clob')).toBe('TEXT')
      })

      it('should map JSON and XML types', () => {
        expect(getFieldTypeForDatabase('postgresql', 'json')).toBe('JSONB')
        expect(getFieldTypeForDatabase('postgresql', 'jsonb')).toBe('JSONB')
        expect(getFieldTypeForDatabase('postgresql', 'xml')).toBe('XML')
      })

      it('should map other types', () => {
        expect(getFieldTypeForDatabase('postgresql', 'boolean')).toBe('BOOLEAN')
        expect(getFieldTypeForDatabase('postgresql', 'bit')).toBe('BOOLEAN')
        expect(getFieldTypeForDatabase('postgresql', 'uuid')).toBe('UUID')
        expect(getFieldTypeForDatabase('postgresql', 'float')).toBe('DOUBLE PRECISION')
        expect(getFieldTypeForDatabase('postgresql', 'double')).toBe('DOUBLE PRECISION')
        expect(getFieldTypeForDatabase('postgresql', 'real')).toBe('REAL')
      })
    })

    describe('SQL Server type mapping', () => {
      it('should map character types', () => {
        expect(getFieldTypeForDatabase('sqlserver', 'varchar')).toBe('VARCHAR(255)')
        expect(getFieldTypeForDatabase('sqlserver', 'varchar(100)')).toBe('VARCHAR(100)')
        expect(getFieldTypeForDatabase('sqlserver', 'nvarchar')).toBe('NVARCHAR(255)')
        expect(getFieldTypeForDatabase('sqlserver', 'nvarchar(100)')).toBe('NVARCHAR(100)')
        expect(getFieldTypeForDatabase('sqlserver', 'char')).toBe('CHAR(1)')
        expect(getFieldTypeForDatabase('sqlserver', 'char(10)')).toBe('CHAR(10)')
        expect(getFieldTypeForDatabase('sqlserver', 'nchar')).toBe('NCHAR(1)')
        expect(getFieldTypeForDatabase('sqlserver', 'nchar(10)')).toBe('NCHAR(10)')
      })

      it('should map text types', () => {
        expect(getFieldTypeForDatabase('sqlserver', 'text')).toBe('NVARCHAR(MAX)')
        expect(getFieldTypeForDatabase('sqlserver', 'mediumtext')).toBe('NVARCHAR(MAX)')
        expect(getFieldTypeForDatabase('sqlserver', 'longtext')).toBe('NVARCHAR(MAX)')
        expect(getFieldTypeForDatabase('sqlserver', 'clob')).toBe('NVARCHAR(MAX)')
      })

      it('should map integer types', () => {
        expect(getFieldTypeForDatabase('sqlserver', 'int')).toBe('INT')
        expect(getFieldTypeForDatabase('sqlserver', 'tinyint')).toBe('TINYINT')
        expect(getFieldTypeForDatabase('sqlserver', 'smallint')).toBe('SMALLINT')
        expect(getFieldTypeForDatabase('sqlserver', 'bigint')).toBe('BIGINT')
        expect(getFieldTypeForDatabase('sqlserver', 'serial')).toBe('BIGINT IDENTITY(1,1)')
      })

      it('should map date/time types', () => {
        expect(getFieldTypeForDatabase('sqlserver', 'date')).toBe('DATE')
        expect(getFieldTypeForDatabase('sqlserver', 'datetime')).toBe('DATETIME2')
        expect(getFieldTypeForDatabase('sqlserver', 'datetime2')).toBe('DATETIME2')
        expect(getFieldTypeForDatabase('sqlserver', 'datetime(6)')).toBe('DATETIME2(6)')
        expect(getFieldTypeForDatabase('sqlserver', 'timestamp')).toBe('DATETIME2')
        expect(getFieldTypeForDatabase('sqlserver', 'time')).toBe('TIME')
        expect(getFieldTypeForDatabase('sqlserver', 'timetz')).toBe('TIME')
      })

      it('should map other types', () => {
        expect(getFieldTypeForDatabase('sqlserver', 'boolean')).toBe('BIT')
        expect(getFieldTypeForDatabase('sqlserver', 'bit')).toBe('BIT')
        expect(getFieldTypeForDatabase('sqlserver', 'uuid')).toBe('UNIQUEIDENTIFIER')
        expect(getFieldTypeForDatabase('sqlserver', 'varbinary')).toBe('VARBINARY(MAX)')
        expect(getFieldTypeForDatabase('sqlserver', 'varbinary(100)')).toBe('VARBINARY(100)')
        expect(getFieldTypeForDatabase('sqlserver', 'xml')).toBe('XML')
        expect(getFieldTypeForDatabase('sqlserver', 'json')).toBe('NVARCHAR(MAX)')
        expect(getFieldTypeForDatabase('sqlserver', 'jsonb')).toBe('NVARCHAR(MAX)')
      })
    })

    describe('Oracle type mapping', () => {
      it('should map character types', () => {
        expect(getFieldTypeForDatabase('oracle', 'varchar')).toBe('VARCHAR2(255)')
        expect(getFieldTypeForDatabase('oracle', 'varchar(100)')).toBe('VARCHAR2(100)')
        expect(getFieldTypeForDatabase('oracle', 'nvarchar')).toBe('NVARCHAR2(255)')
        expect(getFieldTypeForDatabase('oracle', 'nvarchar(100)')).toBe('NVARCHAR2(100)')
        expect(getFieldTypeForDatabase('oracle', 'char')).toBe('CHAR(1)')
        expect(getFieldTypeForDatabase('oracle', 'char(10)')).toBe('CHAR(10)')
        expect(getFieldTypeForDatabase('oracle', 'nchar')).toBe('NCHAR(1)')
        expect(getFieldTypeForDatabase('oracle', 'nchar(10)')).toBe('NCHAR(10)')
        expect(getFieldTypeForDatabase('oracle', 'varchar2')).toBe('VARCHAR2(255)')
        expect(getFieldTypeForDatabase('oracle', 'nvarchar2')).toBe('NVARCHAR2(255)')
      })

      it('should map text types', () => {
        expect(getFieldTypeForDatabase('oracle', 'text')).toBe('CLOB')
        expect(getFieldTypeForDatabase('oracle', 'mediumtext')).toBe('CLOB')
        expect(getFieldTypeForDatabase('oracle', 'longtext')).toBe('CLOB')
        expect(getFieldTypeForDatabase('oracle', 'clob')).toBe('CLOB')
      })

      it('should map integer types', () => {
        expect(getFieldTypeForDatabase('oracle', 'int')).toBe('NUMBER(10)')
        expect(getFieldTypeForDatabase('oracle', 'integer')).toBe('NUMBER(10)')
        expect(getFieldTypeForDatabase('oracle', 'tinyint')).toBe('NUMBER(3)')
        expect(getFieldTypeForDatabase('oracle', 'smallint')).toBe('NUMBER(5)')
        expect(getFieldTypeForDatabase('oracle', 'bigint')).toBe('NUMBER(19)')
        expect(getFieldTypeForDatabase('oracle', 'serial')).toBe('NUMBER GENERATED ALWAYS AS IDENTITY')
      })

      it('should map decimal types', () => {
        expect(getFieldTypeForDatabase('oracle', 'decimal')).toBe('NUMBER(18, 2)')
        expect(getFieldTypeForDatabase('oracle', 'decimal(10,3)')).toBe('NUMBER(10, 3)')
        expect(getFieldTypeForDatabase('oracle', 'number')).toBe('NUMBER(18, 2)')
        expect(getFieldTypeForDatabase('oracle', 'numeric')).toBe('NUMBER(18, 2)')
      })

      it('should map date/time types', () => {
        expect(getFieldTypeForDatabase('oracle', 'date')).toBe('DATE')
        expect(getFieldTypeForDatabase('oracle', 'datetime')).toBe('TIMESTAMP')
        expect(getFieldTypeForDatabase('oracle', 'datetime2')).toBe('TIMESTAMP')
        expect(getFieldTypeForDatabase('oracle', 'timestamp')).toBe('TIMESTAMP')
        expect(getFieldTypeForDatabase('oracle', 'timestamptz')).toBe('TIMESTAMP WITH TIME ZONE')
        expect(getFieldTypeForDatabase('oracle', 'time')).toBe('TIMESTAMP')
        expect(getFieldTypeForDatabase('oracle', 'timetz')).toBe('TIMESTAMP')
      })

      it('should map other types', () => {
        expect(getFieldTypeForDatabase('oracle', 'boolean')).toBe('NUMBER(1)')
        expect(getFieldTypeForDatabase('oracle', 'bit')).toBe('NUMBER(1)')
        expect(getFieldTypeForDatabase('oracle', 'float')).toBe('FLOAT')
        expect(getFieldTypeForDatabase('oracle', 'double')).toBe('BINARY_DOUBLE')
        expect(getFieldTypeForDatabase('oracle', 'real')).toBe('BINARY_FLOAT')
        expect(getFieldTypeForDatabase('oracle', 'uuid')).toBe('CHAR(36)')
        expect(getFieldTypeForDatabase('oracle', 'blob')).toBe('BLOB')
        expect(getFieldTypeForDatabase('oracle', 'varbinary')).toBe('RAW(2000)')
        expect(getFieldTypeForDatabase('oracle', 'varbinary(100)')).toBe('RAW(100)')
        expect(getFieldTypeForDatabase('oracle', 'xml')).toBe('XMLTYPE')
        expect(getFieldTypeForDatabase('oracle', 'json')).toBe('CLOB')
        expect(getFieldTypeForDatabase('oracle', 'jsonb')).toBe('CLOB')
      })
    })
  })
})