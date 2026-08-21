import { describe, expect, it } from 'vitest';
import {
  buildIndexFields,
  buildTypeString,
  extractFunctionName,
  normalizeColumnName,
  normalizeLiteral,
} from '../../parser/normalizers.js';

describe('sql-parser normalizers', () => {
  describe('normalizeColumnName', () => {
    it('should normalize nested column structures', () => {
      expect(normalizeColumnName(undefined)).toBe('');
      expect(normalizeColumnName('user_id')).toBe('user_id');
      expect(
        normalizeColumnName({
          column: {
            expr: { value: 'nested_col' },
          },
        }),
      ).toBe('nested_col');
      expect(normalizeColumnName({ expr: { value: 'expr_col' } })).toBe('expr_col');
      expect(normalizeColumnName({ value: 'value_col' })).toBe('value_col');
      expect(normalizeColumnName(123)).toBe('123');
    });
  });

  describe('buildTypeString', () => {
    it('should build type from length scale and suffix', () => {
      expect(buildTypeString({ dataType: 'NUMERIC', length: 10, scale: 2 })).toBe('NUMERIC(10,2)');
      expect(buildTypeString({ dataType: 'DECIMAL', length: 8, scale: 'null' })).toBe('DECIMAL(8)');
      expect(buildTypeString({ dataType: 'TIMESTAMP', suffix: ['WITH TIME ZONE'] })).toBe(
        'TIMESTAMP(WITH TIME ZONE)',
      );
      expect(buildTypeString({ dataType: 'DATE', suffix: [null, 'null'] })).toBe('DATE');
      expect(buildTypeString({ dataType: 'TEXT' })).toBe('TEXT');
    });
  });

  describe('extractFunctionName', () => {
    it('should extract function names from multiple shapes', () => {
      expect(extractFunctionName(null)).toBeNull();
      expect(extractFunctionName({ keyword: 'CURRENT_TIMESTAMP' })).toBe('current_timestamp');
      expect(
        extractFunctionName({
          type: 'function',
          name: { name: [{ value: 'UUID' }] },
        }),
      ).toBe('uuid');
      expect(
        extractFunctionName({
          type: 'function',
          name: { name: [{ expr: { value: 'NOW' } }] },
        }),
      ).toBe('now');
      expect(extractFunctionName({ type: 'function', name: 'GETDATE' })).toBe('getdate');
      expect(extractFunctionName('SYSTIMESTAMP')).toBe('systimestamp');
      expect(extractFunctionName({ type: 'function', name: {} })).toBeNull();
    });
  });

  describe('normalizeLiteral', () => {
    it('should normalize nested literal values', () => {
      expect(normalizeLiteral(undefined)).toBe('');
      expect(normalizeLiteral({ value: "'abc'" })).toBe('abc');
      expect(normalizeLiteral({ expr: { value: "'xyz'" } })).toBe('xyz');
      expect(normalizeLiteral("'quoted'")).toBe('quoted');
      expect(normalizeLiteral(42)).toBe('42');
    });
  });

  describe('buildIndexFields', () => {
    it('should build index fields and directions correctly', () => {
      expect(buildIndexFields(undefined as unknown as any[])).toEqual([]);

      const fields = buildIndexFields([
        { column: 'id' },
        { column: { expr: { value: 'name' } }, order_by: 'desc' },
        { column: 'created_at', order_by_expr: 'DESCENDING' },
        { column: 'updated_at', order: 'asc' },
      ]);

      expect(fields).toEqual([
        { name: 'id', direction: 'ASC' },
        { name: 'name', direction: 'DESC' },
        { name: 'created_at', direction: 'DESC' },
        { name: 'updated_at', direction: 'ASC' },
      ]);
    });
  });
});
