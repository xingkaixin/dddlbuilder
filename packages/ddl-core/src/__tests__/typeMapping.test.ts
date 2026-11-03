import { describe, it, expect } from 'vitest';
import { getFieldTypeForDatabase } from '../utils/databaseTypeMapping';

describe('Type Mapping Functions', () => {
  it.each([
    ['dm', 'serial', 'BIGINT IDENTITY(1,1)'],
    ['hive', 'varchar(100)', 'STRING'],
  ] as const)('maps %s %s to its SQL representation', (dbType, input, expected) => {
    expect(getFieldTypeForDatabase(dbType, input)).toBe(expected);
  });

  describe('getFieldTypeForDatabase', () => {
    describe('MySQL type mapping', () => {
      it('should map decimal types', () => {
        expect(getFieldTypeForDatabase('mysql', 'decimal')).toBe('DECIMAL(10, 3)');
        expect(getFieldTypeForDatabase('mysql', 'decimal(10,3)')).toBe('DECIMAL(10, 3)');
        expect(getFieldTypeForDatabase('mysql', 'decimal(5)')).toBe('DECIMAL(5)');
        expect(getFieldTypeForDatabase('mysql', 'decimal unsigned')).toBe(
          'DECIMAL(10, 3) UNSIGNED',
        );
      });
    });

    describe('PostgreSQL type mapping', () => {
      it('should map date/time types', () => {
        expect(getFieldTypeForDatabase('postgresql', 'date')).toBe('DATE');
        expect(getFieldTypeForDatabase('postgresql', 'time')).toBe('TIME WITHOUT TIME ZONE');
        expect(getFieldTypeForDatabase('postgresql', 'timetz')).toBe('TIME WITH TIME ZONE');
        expect(getFieldTypeForDatabase('postgresql', 'timestamp')).toBe('TIMESTAMP');
        expect(getFieldTypeForDatabase('postgresql', 'timestamptz')).toBe(
          'TIMESTAMP WITH TIME ZONE',
        );
        expect(getFieldTypeForDatabase('postgresql', 'datetime')).toBe('TIMESTAMP');
        expect(getFieldTypeForDatabase('postgresql', 'time with time zone')).toBe(
          'TIME WITH TIME ZONE',
        );
      });
    });

    describe('SQL Server type mapping', () => {
      it('should map date/time types', () => {
        expect(getFieldTypeForDatabase('sqlserver', 'date')).toBe('DATE');
        expect(getFieldTypeForDatabase('sqlserver', 'datetime')).toBe('DATETIME2');
        expect(getFieldTypeForDatabase('sqlserver', 'datetime2')).toBe('DATETIME2');
        expect(getFieldTypeForDatabase('sqlserver', 'datetime(6)')).toBe('DATETIME2(6)');
        expect(getFieldTypeForDatabase('sqlserver', 'timestamp')).toBe('DATETIME2');
        expect(getFieldTypeForDatabase('sqlserver', 'time')).toBe('TIME');
        expect(getFieldTypeForDatabase('sqlserver', 'timetz')).toBe('TIME');
      });

      it('should map other types', () => {
        expect(getFieldTypeForDatabase('sqlserver', 'boolean')).toBe('BIT');
        expect(getFieldTypeForDatabase('sqlserver', 'bit')).toBe('BIT');
        expect(getFieldTypeForDatabase('sqlserver', 'uuid')).toBe('UNIQUEIDENTIFIER');
        expect(getFieldTypeForDatabase('sqlserver', 'varbinary')).toBe('VARBINARY(MAX)');
        expect(getFieldTypeForDatabase('sqlserver', 'varbinary(100)')).toBe('VARBINARY(100)');
        expect(getFieldTypeForDatabase('sqlserver', 'xml')).toBe('XML');
        expect(getFieldTypeForDatabase('sqlserver', 'json')).toBe('NVARCHAR(MAX)');
        expect(getFieldTypeForDatabase('sqlserver', 'jsonb')).toBe('NVARCHAR(MAX)');
      });
    });

    describe('Oracle type mapping', () => {
      it('should map integer types', () => {
        expect(getFieldTypeForDatabase('oracle', 'int')).toBe('NUMBER(10)');
        expect(getFieldTypeForDatabase('oracle', 'integer')).toBe('NUMBER(10)');
        expect(getFieldTypeForDatabase('oracle', 'tinyint')).toBe('NUMBER(3)');
        expect(getFieldTypeForDatabase('oracle', 'smallint')).toBe('NUMBER(5)');
        expect(getFieldTypeForDatabase('oracle', 'bigint')).toBe('NUMBER(19)');
        expect(getFieldTypeForDatabase('oracle', 'serial')).toBe(
          'NUMBER GENERATED ALWAYS AS IDENTITY',
        );
      });

      it('should map other types', () => {
        expect(getFieldTypeForDatabase('oracle', 'boolean')).toBe('NUMBER(1)');
        expect(getFieldTypeForDatabase('oracle', 'bit')).toBe('NUMBER(1)');
        expect(getFieldTypeForDatabase('oracle', 'float')).toBe('FLOAT');
        expect(getFieldTypeForDatabase('oracle', 'double')).toBe('BINARY_DOUBLE');
        expect(getFieldTypeForDatabase('oracle', 'real')).toBe('BINARY_FLOAT');
        expect(getFieldTypeForDatabase('oracle', 'uuid')).toBe('CHAR(36)');
        expect(getFieldTypeForDatabase('oracle', 'blob')).toBe('BLOB');
        expect(getFieldTypeForDatabase('oracle', 'varbinary')).toBe('RAW(100)');
        expect(getFieldTypeForDatabase('oracle', 'varbinary(100)')).toBe('RAW(100)');
        expect(getFieldTypeForDatabase('oracle', 'xml')).toBe('XMLTYPE');
        expect(getFieldTypeForDatabase('oracle', 'json')).toBe('CLOB');
        expect(getFieldTypeForDatabase('oracle', 'jsonb')).toBe('CLOB');
      });
    });
  });
});
