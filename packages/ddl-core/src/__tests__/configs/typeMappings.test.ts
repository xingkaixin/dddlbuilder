import { describe, expect, it } from 'vitest';
import { TYPE_MAPPINGS } from '../../configs/typeMappings';
import type { ParsedFieldType } from '@ddlbuilder/shared-types';

const parsed: ParsedFieldType = {
  baseType: 'serial',
  args: [],
  unsigned: false,
  raw: 'serial',
};

describe('TYPE_MAPPINGS', () => {
  it('has all supported databases', () => {
    expect(Object.keys(TYPE_MAPPINGS)).toEqual(
      expect.arrayContaining([
        'mysql',
        'mariadb',
        'tidb',
        'postgresql',
        'sqlserver',
        'oracle',
        'dm',
        'oceanbase',
        'oceanbase-oracle',
        'postgresql-citus',
        'hive',
      ]),
    );
  });

  describe('mysql', () => {
    it('maps varchar with default args', () => {
      expect(TYPE_MAPPINGS.mysql.varchar).toEqual({
        mapping: 'varchar',
        defaultArgs: ['255'],
      });
    });

    it('maps nvarchar to varchar', () => {
      expect(TYPE_MAPPINGS.mysql.nvarchar).toEqual({
        mapping: 'varchar',
        defaultArgs: ['255'],
      });
    });

    it('maps char with default args', () => {
      expect(TYPE_MAPPINGS.mysql.char).toEqual({
        mapping: 'char',
        defaultArgs: ['1'],
      });
    });

    it('maps text without args', () => {
      expect(TYPE_MAPPINGS.mysql.text).toEqual({ mapping: 'text' });
    });

    it('maps int without args', () => {
      expect(TYPE_MAPPINGS.mysql.int).toEqual({ mapping: 'int' });
    });

    it('maps decimal with default args', () => {
      expect(TYPE_MAPPINGS.mysql.decimal).toEqual({
        mapping: 'decimal',
        defaultArgs: ['10', '3'],
      });
    });

    it('maps boolean to tinyint', () => {
      expect(TYPE_MAPPINGS.mysql.boolean).toEqual({
        mapping: 'tinyint',
        defaultArgs: ['1'],
      });
    });

    it('maps json', () => {
      expect(TYPE_MAPPINGS.mysql.json).toEqual({ mapping: 'json' });
    });

    it('maps uuid to char(36)', () => {
      expect(TYPE_MAPPINGS.mysql.uuid).toEqual({
        mapping: 'char',
        defaultArgs: ['36'],
      });
    });

    it('maps serial with transform', () => {
      expect(TYPE_MAPPINGS.mysql.serial).toEqual({
        transform: expect.any(Function),
      });
      expect(TYPE_MAPPINGS.mysql.serial.transform?.(parsed)).toBe('BIGINT UNSIGNED AUTO_INCREMENT');
    });

    it('maps timestamp with transform', () => {
      expect(TYPE_MAPPINGS.mysql.timestamp).toEqual({
        transform: expect.any(Function),
      });
      expect(TYPE_MAPPINGS.mysql.timestamp.transform?.(parsed)).toBe('TIMESTAMP');
    });
  });

  describe('mariadb', () => {
    it('shares same structure as mysql', () => {
      expect(TYPE_MAPPINGS.mariadb.varchar).toEqual(TYPE_MAPPINGS.mysql.varchar);
      expect(TYPE_MAPPINGS.mariadb.serial.transform?.(parsed)).toBe(
        'BIGINT UNSIGNED AUTO_INCREMENT',
      );
    });
  });

  describe('tidb', () => {
    it('shares same structure as mysql', () => {
      expect(TYPE_MAPPINGS.tidb.varchar).toEqual(TYPE_MAPPINGS.mysql.varchar);
      expect(TYPE_MAPPINGS.tidb.serial.transform?.(parsed)).toBe(
        'BIGINT UNSIGNED AUTO_INCREMENT',
      );
    });
  });

  describe('postgresql', () => {
    it('maps varchar without default args', () => {
      expect(TYPE_MAPPINGS.postgresql.varchar).toEqual({ mapping: 'varchar' });
    });

    it('maps int to integer', () => {
      expect(TYPE_MAPPINGS.postgresql.int).toEqual({ mapping: 'integer' });
    });

    it('maps tinyint to smallint', () => {
      expect(TYPE_MAPPINGS.postgresql.tinyint).toEqual({ mapping: 'smallint' });
    });

    it('maps float to double precision', () => {
      expect(TYPE_MAPPINGS.postgresql.float).toEqual({ mapping: 'double precision' });
    });

    it('maps datetime to timestamp', () => {
      expect(TYPE_MAPPINGS.postgresql.datetime).toEqual({ mapping: 'timestamp' });
    });

    it('maps timestamptz with suffix', () => {
      expect(TYPE_MAPPINGS.postgresql.timestamptz).toEqual({
        mapping: 'timestamp',
        suffix: 'WITH TIME ZONE',
      });
    });

    it('maps time with suffix', () => {
      expect(TYPE_MAPPINGS.postgresql.time).toEqual({
        mapping: 'time',
        suffix: 'WITHOUT TIME ZONE',
      });
    });

    it('maps timetz with suffix', () => {
      expect(TYPE_MAPPINGS.postgresql.timetz).toEqual({
        mapping: 'time',
        suffix: 'WITH TIME ZONE',
      });
    });

    it('maps json to jsonb', () => {
      expect(TYPE_MAPPINGS.postgresql.json).toEqual({ mapping: 'jsonb' });
    });

    it('maps blob to bytea', () => {
      expect(TYPE_MAPPINGS.postgresql.blob).toEqual({ mapping: 'bytea' });
    });

    it('maps uuid to uuid', () => {
      expect(TYPE_MAPPINGS.postgresql.uuid).toEqual({ mapping: 'uuid' });
    });

    it('maps serial to serial', () => {
      expect(TYPE_MAPPINGS.postgresql.serial).toEqual({ mapping: 'serial' });
    });

    it('maps bigserial to bigserial', () => {
      expect(TYPE_MAPPINGS.postgresql.bigserial).toEqual({ mapping: 'bigserial' });
    });

    it('maps xml to xml', () => {
      expect(TYPE_MAPPINGS.postgresql.xml).toEqual({ mapping: 'xml' });
    });
  });

  describe('sqlserver', () => {
    it('maps varchar with default args', () => {
      expect(TYPE_MAPPINGS.sqlserver.varchar).toEqual({
        mapping: 'varchar',
        defaultArgs: ['255'],
      });
    });

    it('maps nvarchar with default args', () => {
      expect(TYPE_MAPPINGS.sqlserver.nvarchar).toEqual({
        mapping: 'nvarchar',
        defaultArgs: ['255'],
      });
    });

    it('maps text to nvarchar(MAX)', () => {
      expect(TYPE_MAPPINGS.sqlserver.text).toEqual({
        mapping: 'nvarchar',
        defaultArgs: ['MAX'],
      });
    });

    it('maps datetime to datetime2', () => {
      expect(TYPE_MAPPINGS.sqlserver.datetime).toEqual({ mapping: 'datetime2' });
    });

    it('maps datetimeoffset with default args', () => {
      expect(TYPE_MAPPINGS.sqlserver.datetimeoffset).toEqual({
        mapping: 'datetimeoffset',
        defaultArgs: ['7'],
      });
    });

    it('maps boolean to bit', () => {
      expect(TYPE_MAPPINGS.sqlserver.boolean).toEqual({ mapping: 'bit' });
    });

    it('maps json to nvarchar(MAX)', () => {
      expect(TYPE_MAPPINGS.sqlserver.json).toEqual({
        mapping: 'nvarchar',
        defaultArgs: ['MAX'],
      });
    });

    it('maps uuid to uniqueidentifier', () => {
      expect(TYPE_MAPPINGS.sqlserver.uuid).toEqual({ mapping: 'uniqueidentifier' });
    });

    it('maps xml to xml', () => {
      expect(TYPE_MAPPINGS.sqlserver.xml).toEqual({ mapping: 'xml' });
    });

    it('maps serial with transform', () => {
      expect(TYPE_MAPPINGS.sqlserver.serial).toEqual({
        transform: expect.any(Function),
      });
      expect(TYPE_MAPPINGS.sqlserver.serial.transform?.(parsed)).toBe('BIGINT IDENTITY(1,1)');
    });
  });

  describe('oracle', () => {
    it('maps varchar to varchar2', () => {
      expect(TYPE_MAPPINGS.oracle.varchar).toEqual({
        mapping: 'varchar2',
        defaultArgs: ['100'],
      });
    });

    it('maps nvarchar to nvarchar2', () => {
      expect(TYPE_MAPPINGS.oracle.nvarchar).toEqual({
        mapping: 'nvarchar2',
        defaultArgs: ['100'],
      });
    });

    it('maps text to clob', () => {
      expect(TYPE_MAPPINGS.oracle.text).toEqual({ mapping: 'clob' });
    });

    it('maps int to number(10)', () => {
      expect(TYPE_MAPPINGS.oracle.int).toEqual({
        mapping: 'number',
        defaultArgs: ['10'],
      });
    });

    it('maps bigint to number(19)', () => {
      expect(TYPE_MAPPINGS.oracle.bigint).toEqual({
        mapping: 'number',
        defaultArgs: ['19'],
      });
    });

    it('maps double to binary_double', () => {
      expect(TYPE_MAPPINGS.oracle.double).toEqual({ mapping: 'binary_double' });
    });

    it('maps real to binary_float', () => {
      expect(TYPE_MAPPINGS.oracle.real).toEqual({ mapping: 'binary_float' });
    });

    it('maps datetime to timestamp', () => {
      expect(TYPE_MAPPINGS.oracle.datetime).toEqual({ mapping: 'timestamp' });
    });

    it('maps timestamptz with suffix', () => {
      expect(TYPE_MAPPINGS.oracle.timestamptz).toEqual({
        mapping: 'timestamp',
        suffix: 'WITH TIME ZONE',
      });
    });

    it('maps boolean to number(1)', () => {
      expect(TYPE_MAPPINGS.oracle.boolean).toEqual({
        mapping: 'number',
        defaultArgs: ['1'],
      });
    });

    it('maps varbinary to raw(100)', () => {
      expect(TYPE_MAPPINGS.oracle.varbinary).toEqual({
        mapping: 'raw',
        defaultArgs: ['100'],
      });
    });

    it('maps xml to xmltype', () => {
      expect(TYPE_MAPPINGS.oracle.xml).toEqual({ mapping: 'xmltype' });
    });

    it('maps serial with transform', () => {
      expect(TYPE_MAPPINGS.oracle.serial).toEqual({
        transform: expect.any(Function),
      });
      expect(TYPE_MAPPINGS.oracle.serial.transform?.(parsed)).toBe(
        'NUMBER GENERATED ALWAYS AS IDENTITY',
      );
    });
  });

  describe('dm', () => {
    it('maps varchar with default args', () => {
      expect(TYPE_MAPPINGS.dm.varchar).toEqual({
        mapping: 'varchar',
        defaultArgs: ['255'],
      });
    });

    it('maps text to clob', () => {
      expect(TYPE_MAPPINGS.dm.text).toEqual({ mapping: 'clob' });
    });

    it('maps int to int', () => {
      expect(TYPE_MAPPINGS.dm.int).toEqual({ mapping: 'int' });
    });

    it('maps decimal to number(10,2)', () => {
      expect(TYPE_MAPPINGS.dm.decimal).toEqual({
        mapping: 'number',
        defaultArgs: ['10', '2'],
      });
    });

    it('maps timestamptz with suffix', () => {
      expect(TYPE_MAPPINGS.dm.timestamptz).toEqual({
        mapping: 'timestamp',
        suffix: 'WITH TIME ZONE',
      });
    });

    it('maps boolean to number(1)', () => {
      expect(TYPE_MAPPINGS.dm.boolean).toEqual({
        mapping: 'number',
        defaultArgs: ['1'],
      });
    });

    it('maps uuid to char(36)', () => {
      expect(TYPE_MAPPINGS.dm.uuid).toEqual({
        mapping: 'char',
        defaultArgs: ['36'],
      });
    });

    it('maps serial with transform', () => {
      expect(TYPE_MAPPINGS.dm.serial).toEqual({
        transform: expect.any(Function),
      });
      expect(TYPE_MAPPINGS.dm.serial.transform?.(parsed)).toBe('BIGINT IDENTITY(1,1)');
    });

    it('maps json to json', () => {
      expect(TYPE_MAPPINGS.dm.json).toEqual({ mapping: 'json' });
    });
  });

  describe('oceanbase', () => {
    it('shares same structure as mysql', () => {
      expect(TYPE_MAPPINGS.oceanbase.varchar).toEqual(TYPE_MAPPINGS.mysql.varchar);
      expect(TYPE_MAPPINGS.oceanbase.serial.transform?.(parsed)).toBe(
        'BIGINT UNSIGNED AUTO_INCREMENT',
      );
    });
  });

  describe('oceanbase-oracle', () => {
    it('shares same structure as oracle', () => {
      expect(TYPE_MAPPINGS['oceanbase-oracle'].varchar).toEqual(TYPE_MAPPINGS.oracle.varchar);
      expect(TYPE_MAPPINGS['oceanbase-oracle'].serial.transform?.(parsed)).toBe(
        'NUMBER GENERATED ALWAYS AS IDENTITY',
      );
    });
  });

  describe('postgresql-citus', () => {
    it('reuses postgresql mappings', () => {
      expect(TYPE_MAPPINGS['postgresql-citus']).toBe(TYPE_MAPPINGS.postgresql);
    });
  });

  describe('hive', () => {
    it('maps string to STRING', () => {
      expect(TYPE_MAPPINGS.hive.string).toEqual({ mapping: 'STRING' });
    });

    it('maps varchar with transform to STRING', () => {
      expect(TYPE_MAPPINGS.hive.varchar).toEqual({
        transform: expect.any(Function),
      });
      expect(TYPE_MAPPINGS.hive.varchar.transform?.(parsed)).toBe('STRING');
    });

    it('maps text with transform to STRING', () => {
      expect(TYPE_MAPPINGS.hive.text).toEqual({
        transform: expect.any(Function),
      });
      expect(TYPE_MAPPINGS.hive.text.transform?.(parsed)).toBe('STRING');
    });

    it('maps int to INT', () => {
      expect(TYPE_MAPPINGS.hive.int).toEqual({ mapping: 'INT' });
    });

    it('maps decimal to DECIMAL(10,3)', () => {
      expect(TYPE_MAPPINGS.hive.decimal).toEqual({
        mapping: 'DECIMAL',
        defaultArgs: ['10', '3'],
      });
    });

    it('maps datetime to TIMESTAMP', () => {
      expect(TYPE_MAPPINGS.hive.datetime).toEqual({ mapping: 'TIMESTAMP' });
    });

    it('maps time with transform to STRING', () => {
      expect(TYPE_MAPPINGS.hive.time).toEqual({
        transform: expect.any(Function),
      });
      expect(TYPE_MAPPINGS.hive.time.transform?.(parsed)).toBe('STRING');
    });

    it('maps boolean to BOOLEAN', () => {
      expect(TYPE_MAPPINGS.hive.boolean).toEqual({ mapping: 'BOOLEAN' });
    });

    it('maps json with transform to STRING', () => {
      expect(TYPE_MAPPINGS.hive.json).toEqual({
        transform: expect.any(Function),
      });
      expect(TYPE_MAPPINGS.hive.json.transform?.(parsed)).toBe('STRING');
    });

    it('maps blob to BINARY', () => {
      expect(TYPE_MAPPINGS.hive.blob).toEqual({ mapping: 'BINARY' });
    });

    it('maps uuid with transform to STRING', () => {
      expect(TYPE_MAPPINGS.hive.uuid).toEqual({
        transform: expect.any(Function),
      });
      expect(TYPE_MAPPINGS.hive.uuid.transform?.(parsed)).toBe('STRING');
    });

    it('maps serial to INT', () => {
      expect(TYPE_MAPPINGS.hive.serial).toEqual({ mapping: 'INT' });
    });
  });

  describe('transform functions', () => {
    it('mysql timestamp transform ignores input', () => {
      const customParsed: ParsedFieldType = {
        baseType: 'timestamp',
        args: ['6'],
        unsigned: true,
        raw: 'timestamp(6)',
      };
      expect(TYPE_MAPPINGS.mysql.timestamp.transform?.(customParsed)).toBe('TIMESTAMP');
    });

    it('hive varchar transform ignores input', () => {
      const customParsed: ParsedFieldType = {
        baseType: 'varchar',
        args: ['100'],
        unsigned: false,
        raw: 'varchar(100)',
      };
      expect(TYPE_MAPPINGS.hive.varchar.transform?.(customParsed)).toBe('STRING');
    });

    it('oracle serial transform ignores input', () => {
      const customParsed: ParsedFieldType = {
        baseType: 'serial',
        args: [],
        unsigned: false,
        raw: 'serial',
      };
      expect(TYPE_MAPPINGS.oracle.serial.transform?.(customParsed)).toBe(
        'NUMBER GENERATED ALWAYS AS IDENTITY',
      );
    });
  });
});
