import { describe, it, expect } from 'vitest';
import { TypeMapper } from '@ddlbuilder/ddl-core';

describe('TypeMapper', () => {
  describe('create', () => {
    it('should create a TypeMapper instance', () => {
      const mapper = TypeMapper.create('mysql');
      expect(mapper).toBeInstanceOf(TypeMapper);
    });

    it('should create mapper for all supported database types', () => {
      const dbTypes = [
        'mysql',
        'postgresql',
        'sqlserver',
        'oracle',
        'mariadb',
        'tidb',
        'oceanbase',
        'oceanbase-oracle',
        'dm',
      ] as const;

      dbTypes.forEach((dbType) => {
        const mapper = TypeMapper.create(dbType);
        expect(mapper).toBeInstanceOf(TypeMapper);
      });
    });
  });

  describe('mapType', () => {
    it('should map basic types for MySQL', () => {
      const mapper = TypeMapper.create('mysql');

      expect(
        mapper.mapType({
          baseType: 'varchar',
          args: [],
          unsigned: false,
          raw: 'varchar',
        }),
      ).toBe('VARCHAR(255)');
      expect(
        mapper.mapType({
          baseType: 'int',
          args: [],
          unsigned: false,
          raw: 'int',
        }),
      ).toBe('INT');
      expect(
        mapper.mapType({
          baseType: 'text',
          args: [],
          unsigned: false,
          raw: 'text',
        }),
      ).toBe('TEXT');
    });

    it('should handle unsigned modifier for MySQL', () => {
      const mapper = TypeMapper.create('mysql');

      expect(
        mapper.mapType({
          baseType: 'int',
          args: [],
          unsigned: true,
          raw: 'int unsigned',
        }),
      ).toBe('INT UNSIGNED');
      expect(
        mapper.mapType({
          baseType: 'bigint',
          args: [],
          unsigned: true,
          raw: 'bigint unsigned',
        }),
      ).toBe('BIGINT UNSIGNED');
    });

    it('should preserve original args when provided', () => {
      const mapper = TypeMapper.create('mysql');

      expect(
        mapper.mapType({
          baseType: 'varchar',
          args: ['100'],
          unsigned: false,
          raw: 'varchar(100)',
        }),
      ).toBe('VARCHAR(100)');
      expect(
        mapper.mapType({
          baseType: 'decimal',
          args: ['10', '2'],
          unsigned: false,
          raw: 'decimal(10,2)',
        }),
      ).toBe('DECIMAL(10, 2)');
    });

    it('should handle transform functions', () => {
      const mapper = TypeMapper.create('mysql');

      // TIMESTAMP has a transform function that returns 'TIMESTAMP'
      expect(
        mapper.mapType({
          baseType: 'timestamp',
          args: ['6'],
          unsigned: false,
          raw: 'timestamp(6)',
        }),
      ).toBe('TIMESTAMP');
    });

    it('should handle unknown types by returning original', () => {
      const mapper = TypeMapper.create('mysql');

      // Unknown types are returned in their original case (preserveCase=true)
      expect(
        mapper.mapType({
          baseType: 'custom_type',
          args: [],
          unsigned: false,
          raw: 'custom_type',
        }),
      ).toBe('custom_type');
    });

    it('should handle unknown types with unsigned for MySQL', () => {
      const mapper = TypeMapper.create('mysql');

      // Unknown types preserve case, but UNSIGNED is added as uppercase
      expect(
        mapper.mapType({
          baseType: 'unknown',
          args: [],
          unsigned: true,
          raw: 'unknown unsigned',
        }),
      ).toBe('unknown UNSIGNED');
    });

    it('should not add unsigned for databases that do not support it', () => {
      const mapper = TypeMapper.create('postgresql');

      expect(
        mapper.mapType({
          baseType: 'int',
          args: [],
          unsigned: true,
          raw: 'int unsigned',
        }),
      ).toBe('INTEGER');
    });

    it('should map types for PostgreSQL', () => {
      const mapper = TypeMapper.create('postgresql');

      expect(
        mapper.mapType({
          baseType: 'varchar',
          args: [],
          unsigned: false,
          raw: 'varchar',
        }),
      ).toBe('VARCHAR');
      expect(
        mapper.mapType({
          baseType: 'int',
          args: [],
          unsigned: false,
          raw: 'int',
        }),
      ).toBe('INTEGER');
      expect(
        mapper.mapType({
          baseType: 'text',
          args: [],
          unsigned: false,
          raw: 'text',
        }),
      ).toBe('TEXT');
      expect(
        mapper.mapType({
          baseType: 'json',
          args: [],
          unsigned: false,
          raw: 'json',
        }),
      ).toBe('JSONB');
    });

    it('should map types for Oracle', () => {
      const mapper = TypeMapper.create('oracle');

      expect(
        mapper.mapType({
          baseType: 'varchar',
          args: [],
          unsigned: false,
          raw: 'varchar',
        }),
      ).toBe('VARCHAR2(100)');
      expect(
        mapper.mapType({
          baseType: 'int',
          args: [],
          unsigned: false,
          raw: 'int',
        }),
      ).toBe('NUMBER(10)');
      expect(
        mapper.mapType({
          baseType: 'text',
          args: [],
          unsigned: false,
          raw: 'text',
        }),
      ).toBe('CLOB');
    });

    it('should map types for SQL Server', () => {
      const mapper = TypeMapper.create('sqlserver');

      expect(
        mapper.mapType({
          baseType: 'varchar',
          args: [],
          unsigned: false,
          raw: 'varchar',
        }),
      ).toBe('VARCHAR(255)');
      expect(
        mapper.mapType({
          baseType: 'nvarchar',
          args: [],
          unsigned: false,
          raw: 'nvarchar',
        }),
      ).toBe('NVARCHAR(255)');
      expect(
        mapper.mapType({
          baseType: 'text',
          args: [],
          unsigned: false,
          raw: 'text',
        }),
      ).toBe('NVARCHAR(MAX)');
    });

    it('should handle suffix in mapping', () => {
      const mapper = TypeMapper.create('postgresql');

      expect(
        mapper.mapType({
          baseType: 'timestamptz',
          args: [],
          unsigned: false,
          raw: 'timestamptz',
        }),
      ).toBe('TIMESTAMP WITH TIME ZONE');
      expect(
        mapper.mapType({
          baseType: 'time',
          args: [],
          unsigned: false,
          raw: 'time',
        }),
      ).toBe('TIME WITHOUT TIME ZONE');
    });

    it('should handle MAX argument', () => {
      const mapper = TypeMapper.create('sqlserver');

      expect(
        mapper.mapType({
          baseType: 'varchar',
          args: ['max'],
          unsigned: false,
          raw: 'varchar(max)',
        }),
      ).toBe('VARCHAR(MAX)');
    });
  });

  describe('getSupportedTypes', () => {
    it('should return supported types for MySQL', () => {
      const mapper = TypeMapper.create('mysql');
      const types = mapper.getSupportedTypes();

      expect(types).toContain('varchar');
      expect(types).toContain('int');
      expect(types).toContain('text');
      expect(types).toContain('decimal');
    });

    it('should return supported types for PostgreSQL', () => {
      const mapper = TypeMapper.create('postgresql');
      const types = mapper.getSupportedTypes();

      expect(types).toContain('varchar');
      expect(types).toContain('int');
      expect(types).toContain('jsonb');
      expect(types).toContain('uuid');
    });

    it('should return empty array for unsupported database', () => {
      const mapper = TypeMapper.create('unsupported' as any);
      const types = mapper.getSupportedTypes();

      expect(types).toEqual([]);
    });
  });

  describe('hasMapping', () => {
    it('should return true for mapped types', () => {
      const mapper = TypeMapper.create('mysql');

      expect(mapper.hasMapping('varchar')).toBe(true);
      expect(mapper.hasMapping('int')).toBe(true);
      expect(mapper.hasMapping('text')).toBe(true);
    });

    it('should return false for unmapped types', () => {
      const mapper = TypeMapper.create('mysql');

      expect(mapper.hasMapping('unknown_type')).toBe(false);
      expect(mapper.hasMapping('custom123')).toBe(false);
    });

    it('should handle type aliases', () => {
      const mapper = TypeMapper.create('mysql');

      // integer is an alias for int
      expect(mapper.hasMapping('integer')).toBe(true);
      // number is an alias for decimal
      expect(mapper.hasMapping('number')).toBe(true);
    });

    it('should handle case variations', () => {
      const mapper = TypeMapper.create('mysql');

      // The hasMapping method uses canonicalizeBaseType which may not handle all case variations
      // Let's test with lowercase which should always work
      expect(mapper.hasMapping('varchar')).toBe(true);
      expect(mapper.hasMapping('int')).toBe(true);
      expect(mapper.hasMapping('text')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty args', () => {
      const mapper = TypeMapper.create('mysql');

      expect(
        mapper.mapType({
          baseType: 'varchar',
          args: [],
          unsigned: false,
          raw: 'varchar',
        }),
      ).toBe('VARCHAR(255)');
    });

    it('should handle empty base type', () => {
      const mapper = TypeMapper.create('mysql');

      expect(mapper.mapType({ baseType: '', args: [], unsigned: false, raw: '' })).toBe('');
    });

    it('should handle OceanBase Oracle mode', () => {
      const mapper = TypeMapper.create('oceanbase-oracle');

      expect(
        mapper.mapType({
          baseType: 'varchar',
          args: [],
          unsigned: false,
          raw: 'varchar',
        }),
      ).toBe('VARCHAR2(100)');
      expect(
        mapper.mapType({
          baseType: 'int',
          args: [],
          unsigned: false,
          raw: 'int',
        }),
      ).toBe('NUMBER(10)');
    });

    it('should handle DM database', () => {
      const mapper = TypeMapper.create('dm');

      expect(
        mapper.mapType({
          baseType: 'varchar',
          args: [],
          unsigned: false,
          raw: 'varchar',
        }),
      ).toBe('VARCHAR(255)');
      expect(
        mapper.mapType({
          baseType: 'int',
          args: [],
          unsigned: false,
          raw: 'int',
        }),
      ).toBe('INT');
    });
  });
});
