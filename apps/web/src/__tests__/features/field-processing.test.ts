import { describe, it, expect } from 'vitest';
import type { FieldRow } from '@ddlbuilder/shared-types';
import { normalizeFields, isReservedKeyword, toStringSafe } from '@/utils/helpers';
import {
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsOnUpdateCurrentTimestamp,
  escapeSingleQuotes,
  formatConstantDefault,
  shouldQuoteDefault,
  getCanonicalBaseType,
  splitQualifiedName,
  getSchemaAndTable,
} from '@ddlbuilder/ddl-core';
import { RESERVED_KEYWORDS } from '@/utils/constants';
import {
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
} from '@ddlbuilder/shared-types';

describe('Field Processing Functions', () => {
  describe('normalizeFields', () => {
    it('should normalize valid fields', () => {
      const input: FieldRow[] = [
        {
          order: 1,
          fieldName: 'id',
          fieldType: 'int',
          fieldComment: 'Primary key',
          nullable: false,
          defaultKind: 'auto_increment',
          defaultValue: '',
          onUpdate: 'none',
        },
        {
          order: 2,
          fieldName: 'name',
          fieldType: 'varchar(255)',
          fieldComment: 'Name field',
          nullable: true,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
      ];

      const result = normalizeFields(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'id',
        type: 'int',
        comment: 'Primary key',
        nullable: false,
        defaultKind: 'auto_increment',
        defaultValue: '',
        onUpdate: 'none',
      });
      expect(result[1]).toEqual({
        name: 'name',
        type: 'varchar(255)',
        comment: 'Name field',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      });
    });

    it('should filter out fields with empty name or type', () => {
      const input: FieldRow[] = [
        {
          order: 1,
          fieldName: 'id',
          fieldType: 'int',
          fieldComment: 'Valid field',
          nullable: false,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
        {
          order: 2,
          fieldName: '',
          fieldType: 'varchar(255)',
          fieldComment: 'Empty name',
          nullable: true,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
        {
          order: 3,
          fieldName: 'invalid',
          fieldType: '',
          fieldComment: 'Empty type',
          nullable: true,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
        {
          order: 4,
          fieldName: 'valid',
          fieldType: 'text',
          fieldComment: 'Another valid field',
          nullable: true,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
      ];

      const result = normalizeFields(input);

      expect(result).toHaveLength(2);
      expect(result.map((f) => f.name)).toEqual(['id', 'valid']);
    });

    it('should handle whitespace trimming', () => {
      const input: FieldRow[] = [
        {
          order: 1,
          fieldName: '  name  ',
          fieldType: '  varchar(255)  ',
          fieldComment: '  comment  ',
          nullable: true,
          defaultKind: 'none',
          defaultValue: '  default  ',
          onUpdate: 'none',
        },
      ];

      const result = normalizeFields(input);

      expect(result[0]).toEqual({
        name: 'name',
        type: 'varchar(255)',
        comment: 'comment',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '  default  ',
        onUpdate: 'none',
      });
    });
  });

  describe('normalizeFieldNullable', () => {
    it('should treat yes-like values as nullable', () => {
      expect(normalizeFieldNullable(true)).toBe(true);
      expect(normalizeFieldNullable('yes')).toBe(true);
      expect(normalizeFieldNullable('true')).toBe(true);
      expect(normalizeFieldNullable('1')).toBe(true);
      expect(normalizeFieldNullable('是')).toBe(true);
      expect(normalizeFieldNullable('√')).toBe(true);
      expect(normalizeFieldNullable('YES')).toBe(true);
    });

    it('should treat no-like values as not nullable', () => {
      expect(normalizeFieldNullable(false)).toBe(false);
      expect(normalizeFieldNullable('n')).toBe(false);
      expect(normalizeFieldNullable('no')).toBe(false);
      expect(normalizeFieldNullable('false')).toBe(false);
      expect(normalizeFieldNullable('0')).toBe(false);
      expect(normalizeFieldNullable('否')).toBe(false);
      expect(normalizeFieldNullable('NOT NULL')).toBe(false);
    });
  });

  describe('normalizeFieldDefaultKind', () => {
    it('should normalize legacy and current default kinds to canonical tokens', () => {
      expect(normalizeFieldDefaultKind('自增')).toBe('auto_increment');
      expect(normalizeFieldDefaultKind('常量')).toBe('constant');
      expect(normalizeFieldDefaultKind('当前时间')).toBe('current_timestamp');
      expect(normalizeFieldDefaultKind('无')).toBe('none');
      expect(normalizeFieldDefaultKind('auto_increment')).toBe('auto_increment');
      expect(normalizeFieldDefaultKind('')).toBe('none');
      expect(normalizeFieldDefaultKind(undefined)).toBe('none');
      expect(normalizeFieldDefaultKind('invalid')).toBe('none');
    });
  });

  describe('normalizeFieldOnUpdate', () => {
    it('should normalize legacy and current update kinds to canonical tokens', () => {
      expect(normalizeFieldOnUpdate('当前时间')).toBe('current_timestamp');
      expect(normalizeFieldOnUpdate('无')).toBe('none');
      expect(normalizeFieldOnUpdate('current_timestamp')).toBe('current_timestamp');
      expect(normalizeFieldOnUpdate('')).toBe('none');
      expect(normalizeFieldOnUpdate(undefined)).toBe('none');
      expect(normalizeFieldOnUpdate('invalid')).toBe('none');
    });
  });

  describe('supportsAutoIncrement', () => {
    it('should correctly identify auto increment support', () => {
      // MySQL
      expect(supportsAutoIncrement('mysql', 'int')).toBe(true);
      expect(supportsAutoIncrement('mysql', 'bigint')).toBe(true);
      expect(supportsAutoIncrement('mysql', 'tinyint')).toBe(true);
      expect(supportsAutoIncrement('mysql', 'smallint')).toBe(true);
      expect(supportsAutoIncrement('mysql', 'varchar')).toBe(false);

      // PostgreSQL
      expect(supportsAutoIncrement('postgresql', 'int')).toBe(true);
      expect(supportsAutoIncrement('postgresql', 'smallint')).toBe(true);
      expect(supportsAutoIncrement('postgresql', 'bigint')).toBe(true);
      expect(supportsAutoIncrement('postgresql', 'tinyint')).toBe(false);
      expect(supportsAutoIncrement('postgresql', 'varchar')).toBe(false);

      // SQL Server
      expect(supportsAutoIncrement('sqlserver', 'int')).toBe(true);
      expect(supportsAutoIncrement('sqlserver', 'tinyint')).toBe(true);
      expect(supportsAutoIncrement('sqlserver', 'smallint')).toBe(true);
      expect(supportsAutoIncrement('sqlserver', 'bigint')).toBe(true);
      expect(supportsAutoIncrement('sqlserver', 'varchar')).toBe(false);

      // Oracle
      expect(supportsAutoIncrement('oracle', 'int')).toBe(true);
      expect(supportsAutoIncrement('oracle', 'decimal')).toBe(true);
      expect(supportsAutoIncrement('oracle', 'number')).toBe(true);
      expect(supportsAutoIncrement('oracle', 'varchar')).toBe(false);

      expect(supportsAutoIncrement('gbase', 'int')).toBe(true);
      expect(supportsAutoIncrement('polardb', 'bigint')).toBe(true);
      expect(supportsAutoIncrement('kingbase', 'int')).toBe(true);
      expect(supportsAutoIncrement('gaussdb', 'bigint')).toBe(true);
    });
  });

  describe('supportsDefaultCurrentTimestamp', () => {
    it('should correctly identify timestamp default support', () => {
      // MySQL
      expect(supportsDefaultCurrentTimestamp('mysql', 'timestamp')).toBe(true);
      expect(supportsDefaultCurrentTimestamp('mysql', 'datetime')).toBe(true);
      expect(supportsDefaultCurrentTimestamp('mysql', 'varchar')).toBe(false);

      // PostgreSQL
      expect(supportsDefaultCurrentTimestamp('postgresql', 'timestamp')).toBe(true);
      expect(supportsDefaultCurrentTimestamp('postgresql', 'timestamptz')).toBe(true);
      expect(supportsDefaultCurrentTimestamp('postgresql', 'varchar')).toBe(false);

      // SQL Server
      expect(supportsDefaultCurrentTimestamp('sqlserver', 'datetime')).toBe(true);
      expect(supportsDefaultCurrentTimestamp('sqlserver', 'datetime2')).toBe(true);
      expect(supportsDefaultCurrentTimestamp('sqlserver', 'varchar')).toBe(false);

      // Oracle
      expect(supportsDefaultCurrentTimestamp('oracle', 'timestamp')).toBe(true);
      expect(supportsDefaultCurrentTimestamp('oracle', 'varchar')).toBe(false);

      expect(supportsDefaultCurrentTimestamp('gbase', 'datetime')).toBe(true);
      expect(supportsDefaultCurrentTimestamp('polardb', 'timestamp')).toBe(true);
      expect(supportsDefaultCurrentTimestamp('kingbase', 'timestamptz')).toBe(true);
      expect(supportsDefaultCurrentTimestamp('gaussdb', 'timestamp')).toBe(true);
    });
  });

  describe('supportsOnUpdateCurrentTimestamp', () => {
    it('should only support MySQL timestamp on update', () => {
      expect(supportsOnUpdateCurrentTimestamp('mysql', 'timestamp')).toBe(true);
      expect(supportsOnUpdateCurrentTimestamp('mysql', 'datetime')).toBe(true);
      expect(supportsOnUpdateCurrentTimestamp('postgresql', 'timestamp')).toBe(false);
      expect(supportsOnUpdateCurrentTimestamp('sqlserver', 'datetime')).toBe(false);
      expect(supportsOnUpdateCurrentTimestamp('oracle', 'timestamp')).toBe(false);
      expect(supportsOnUpdateCurrentTimestamp('gbase', 'timestamp')).toBe(true);
      expect(supportsOnUpdateCurrentTimestamp('polardb', 'datetime')).toBe(true);
      expect(supportsOnUpdateCurrentTimestamp('kingbase', 'timestamp')).toBe(false);
      expect(supportsOnUpdateCurrentTimestamp('gaussdb', 'timestamp')).toBe(false);
    });
  });

  describe('isReservedKeyword', () => {
    it('should correctly identify reserved keywords', () => {
      // MySQL keywords
      expect(isReservedKeyword('mysql', 'table')).toBe(true);
      expect(isReservedKeyword('mysql', 'select')).toBe(true);
      expect(isReservedKeyword('mysql', 'create')).toBe(true);
      expect(isReservedKeyword('mysql', 'not_reserved')).toBe(false);

      // PostgreSQL keywords
      expect(isReservedKeyword('postgresql', 'table')).toBe(true);
      expect(isReservedKeyword('postgresql', 'select')).toBe(true);
      expect(isReservedKeyword('postgresql', 'with')).toBe(true);
      expect(isReservedKeyword('postgresql', 'not_reserved')).toBe(false);

      // SQL Server keywords
      expect(isReservedKeyword('sqlserver', 'table')).toBe(true);
      expect(isReservedKeyword('sqlserver', 'select')).toBe(true);
      expect(isReservedKeyword('sqlserver', 'procedure')).toBe(true);
      expect(isReservedKeyword('sqlserver', 'not_reserved')).toBe(false);

      // Oracle keywords
      expect(isReservedKeyword('oracle', 'table')).toBe(true);
      expect(isReservedKeyword('oracle', 'select')).toBe(true);
      expect(isReservedKeyword('oracle', 'synonym')).toBe(true);
      expect(isReservedKeyword('oracle', 'not_reserved')).toBe(false);
    });

    it('should handle case insensitive matching', () => {
      expect(isReservedKeyword('mysql', 'TABLE')).toBe(true);
      expect(isReservedKeyword('mysql', 'Select')).toBe(true);
      expect(isReservedKeyword('mysql', 'CREATE')).toBe(true);
    });

    it('should handle whitespace and empty strings', () => {
      expect(isReservedKeyword('mysql', '')).toBe(false);
      expect(isReservedKeyword('mysql', '   ')).toBe(false);
      expect(isReservedKeyword('mysql', ' table ')).toBe(true); // table is a keyword regardless of whitespace
    });
  });

  describe('toStringSafe', () => {
    it('should safely convert values to strings', () => {
      expect(toStringSafe('hello')).toBe('hello');
      expect(toStringSafe(123)).toBe('123');
      expect(toStringSafe(true)).toBe('true');
      expect(toStringSafe(null)).toBe('');
      expect(toStringSafe(undefined)).toBe('');
      expect(toStringSafe({})).toBe('[object Object]');
    });
  });

  describe('escapeSingleQuotes', () => {
    it('should escape single quotes for SQL', () => {
      expect(escapeSingleQuotes("O'Reilly")).toBe("O''Reilly");
      expect(escapeSingleQuotes("It's a test")).toBe("It''s a test");
      expect(escapeSingleQuotes("''multiple''quotes''")).toBe("''''multiple''''quotes''''");
      expect(escapeSingleQuotes('no quotes')).toBe('no quotes');
      expect(escapeSingleQuotes('')).toBe('');
    });
  });

  describe('formatConstantDefault', () => {
    it('should format constant defaults correctly', () => {
      // Text-like types should be quoted
      expect(formatConstantDefault('varchar', 'test')).toBe(" DEFAULT 'test'");
      expect(formatConstantDefault('text', 'hello world')).toBe(" DEFAULT 'hello world'");
      expect(formatConstantDefault('char', "O'Reilly")).toBe(" DEFAULT 'O''Reilly'");
      expect(formatConstantDefault('date', '2023-01-01')).toBe(" DEFAULT '2023-01-01'");
      expect(formatConstantDefault('timestamp', '2023-01-01 12:00:00')).toBe(
        " DEFAULT '2023-01-01 12:00:00'",
      );

      // Numeric types should not be quoted
      expect(formatConstantDefault('int', '123')).toBe(' DEFAULT 123');
      expect(formatConstantDefault('decimal', '123.45')).toBe(' DEFAULT 123.45');
      expect(formatConstantDefault('float', '12.34')).toBe(' DEFAULT 12.34');

      // Constants remain literal even when their text resembles SQL.
      expect(formatConstantDefault('varchar', 'CURRENT_TIMESTAMP')).toBe(
        " DEFAULT 'CURRENT_TIMESTAMP'",
      );
      expect(formatConstantDefault('varchar', 'UUID()')).toBe(" DEFAULT 'UUID()'");
      expect(formatConstantDefault('varchar', 'GEN_RANDOM_UUID()')).toBe(
        " DEFAULT 'GEN_RANDOM_UUID()'",
      );

      // Empty strings and whitespace are valid text defaults.
      expect(formatConstantDefault('varchar', '')).toBe(" DEFAULT ''");
      expect(formatConstantDefault('varchar', '   ')).toBe(" DEFAULT '   '");
    });
  });

  describe('shouldQuoteDefault', () => {
    it('should identify types that need quoting', () => {
      expect(shouldQuoteDefault('varchar', '')).toBe(true);
      expect(shouldQuoteDefault('nvarchar', '')).toBe(true);
      expect(shouldQuoteDefault('char', '')).toBe(true);
      expect(shouldQuoteDefault('nchar', '')).toBe(true);
      expect(shouldQuoteDefault('text', '')).toBe(true);
      expect(shouldQuoteDefault('mediumtext', '')).toBe(true);
      expect(shouldQuoteDefault('longtext', '')).toBe(true);
      expect(shouldQuoteDefault('uuid', '')).toBe(true);
      expect(shouldQuoteDefault('xml', '')).toBe(true);
      expect(shouldQuoteDefault('json', '')).toBe(true);
      expect(shouldQuoteDefault('jsonb', '')).toBe(true);
      expect(shouldQuoteDefault('clob', '')).toBe(true);
      expect(shouldQuoteDefault('varchar2', '')).toBe(true);
      expect(shouldQuoteDefault('nvarchar2', '')).toBe(true);
      expect(shouldQuoteDefault('date', '')).toBe(true);
      expect(shouldQuoteDefault('time', '')).toBe(true);
      expect(shouldQuoteDefault('timestamp', '')).toBe(true);
      expect(shouldQuoteDefault('datetime', '')).toBe(true);
      expect(shouldQuoteDefault('datetime2', '')).toBe(true);
      expect(shouldQuoteDefault('timetz', '')).toBe(true);
      expect(shouldQuoteDefault('timestamptz', '')).toBe(true);

      expect(shouldQuoteDefault('int', '')).toBe(false);
      expect(shouldQuoteDefault('bigint', '')).toBe(false);
      expect(shouldQuoteDefault('decimal', '')).toBe(false);
      expect(shouldQuoteDefault('float', '')).toBe(false);
      expect(shouldQuoteDefault('double', '')).toBe(false);
      expect(shouldQuoteDefault('real', '')).toBe(false);
      expect(shouldQuoteDefault('boolean', '')).toBe(false);
      expect(shouldQuoteDefault('bit', '')).toBe(false);
    });
  });

  describe('getCanonicalBaseType', () => {
    it('should get canonical base type from raw type', () => {
      expect(getCanonicalBaseType('varchar')).toBe('varchar');
      expect(getCanonicalBaseType('VARCHAR')).toBe('varchar');
      expect(getCanonicalBaseType('varchar(255)')).toBe('varchar');
      expect(getCanonicalBaseType('int unsigned')).toBe('int');
      expect(getCanonicalBaseType('character varying(100)')).toBe('varchar');
      expect(getCanonicalBaseType('')).toBe('');
      expect(getCanonicalBaseType('   ')).toBe('');
      expect(getCanonicalBaseType('timestamp(6) not null')).toBe('timestamp');
      expect(getCanonicalBaseType('timestamp default current_timestamp')).toBe('timestamp');
      expect(getCanonicalBaseType('time with time zone')).toBe('timetz');
    });
  });

  describe('Table Name Processing', () => {
    describe('splitQualifiedName', () => {
      it('should split qualified names', () => {
        expect(splitQualifiedName('table')).toEqual(['table']);
        expect(splitQualifiedName('schema.table')).toEqual(['schema', 'table']);
        expect(splitQualifiedName('db.schema.table')).toEqual(['db', 'schema', 'table']);
        expect(splitQualifiedName('db.schema.table_name')).toEqual(['db', 'schema', 'table_name']);
        expect(splitQualifiedName('schema . table')).toEqual(['schema', 'table']);
        expect(splitQualifiedName('')).toEqual([]);
        expect(splitQualifiedName('   ')).toEqual([]);
      });
    });

    describe('getSchemaAndTable', () => {
      it('should extract schema and table from qualified names', () => {
        expect(getSchemaAndTable('table')).toEqual({
          schema: '',
          table: 'table',
        });
        expect(getSchemaAndTable('schema.table')).toEqual({
          schema: 'schema',
          table: 'table',
        });
        expect(getSchemaAndTable('db.schema.table')).toEqual({
          schema: 'db.schema',
          table: 'table',
        });
        expect(getSchemaAndTable('  schema.table  ')).toEqual({
          schema: 'schema',
          table: 'table',
        });
        expect(getSchemaAndTable('')).toEqual({ schema: '', table: '' });
        expect(getSchemaAndTable('   ')).toEqual({ schema: '', table: '' });
      });
    });
  });

  describe('Constants', () => {
    describe('RESERVED_KEYWORDS', () => {
      it('should contain keywords for all databases', () => {
        expect(RESERVED_KEYWORDS.mysql).toBeInstanceOf(Set);
        expect(RESERVED_KEYWORDS.postgresql).toBeInstanceOf(Set);
        expect(RESERVED_KEYWORDS.sqlserver).toBeInstanceOf(Set);
        expect(RESERVED_KEYWORDS.oracle).toBeInstanceOf(Set);

        // Check some common keywords
        expect(RESERVED_KEYWORDS.mysql.has('table')).toBe(true);
        expect(RESERVED_KEYWORDS.postgresql.has('table')).toBe(true);
        expect(RESERVED_KEYWORDS.sqlserver.has('table')).toBe(true);
        expect(RESERVED_KEYWORDS.oracle.has('table')).toBe(true);

        // Oracle-specific keyword
        expect(RESERVED_KEYWORDS.oracle.has('synonym')).toBe(true);
        expect(RESERVED_KEYWORDS.mysql.has('synonym')).toBe(false);
      });
    });
  });
});
