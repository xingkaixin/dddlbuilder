import { describe, it, expect } from 'vitest';
import { detectFieldTypeRisk } from '@/utils/fieldTypeRisk';

describe('detectFieldTypeRisk', () => {
  it('returns null when old type is empty', () => {
    expect(detectFieldTypeRisk('', 'int')).toBeNull();
  });

  it('returns null when new type is empty', () => {
    expect(detectFieldTypeRisk('varchar(255)', '')).toBeNull();
  });

  it('returns null when types are identical', () => {
    expect(detectFieldTypeRisk('varchar(255)', 'varchar(255)')).toBeNull();
  });

  it('returns null when same base type with same length', () => {
    expect(detectFieldTypeRisk('varchar(100)', 'varchar(100)')).toBeNull();
  });

  it('returns null when same base type with larger length', () => {
    expect(detectFieldTypeRisk('varchar(100)', 'varchar(255)')).toBeNull();
  });

  it('detects length_shrink when varchar length is reduced', () => {
    const risk = detectFieldTypeRisk('varchar(255)', 'varchar(100)');
    expect(risk).not.toBeNull();
    expect(risk?.kind).toBe('length_shrink');
    expect(risk?.fromType).toBe('varchar(255)');
    expect(risk?.toType).toBe('varchar(100)');
  });

  it('detects length_shrink for decimal precision reduction', () => {
    const risk = detectFieldTypeRisk('decimal(10,3)', 'decimal(5,2)');
    expect(risk).not.toBeNull();
    expect(risk?.kind).toBe('length_shrink');
  });

  it('detects type_change for string → integer', () => {
    const risk = detectFieldTypeRisk('varchar(255)', 'int');
    expect(risk).not.toBeNull();
    expect(risk?.kind).toBe('type_change');
  });

  it('detects type_change for integer → string', () => {
    const risk = detectFieldTypeRisk('int', 'varchar(255)');
    expect(risk).not.toBeNull();
    expect(risk?.kind).toBe('type_change');
  });

  it('detects type_change for string → datetime', () => {
    const risk = detectFieldTypeRisk('varchar(100)', 'datetime');
    expect(risk).not.toBeNull();
    expect(risk?.kind).toBe('type_change');
  });

  it('detects type_change for integer → boolean', () => {
    const risk = detectFieldTypeRisk('int', 'boolean');
    expect(risk).not.toBeNull();
    expect(risk?.kind).toBe('type_change');
  });

  it('detects type_change for datetime → integer', () => {
    const risk = detectFieldTypeRisk('datetime', 'bigint');
    expect(risk).not.toBeNull();
    expect(risk?.kind).toBe('type_change');
  });

  it('detects length_shrink for integer narrowing (bigint → int)', () => {
    const risk = detectFieldTypeRisk('bigint', 'int');
    expect(risk).not.toBeNull();
    expect(risk?.kind).toBe('length_shrink');
  });

  it('detects length_shrink for integer narrowing (int → smallint)', () => {
    const risk = detectFieldTypeRisk('int', 'smallint');
    expect(risk).not.toBeNull();
    expect(risk?.kind).toBe('length_shrink');
  });

  it('detects length_shrink for integer narrowing (int → tinyint)', () => {
    const risk = detectFieldTypeRisk('int', 'tinyint');
    expect(risk).not.toBeNull();
    expect(risk?.kind).toBe('length_shrink');
  });

  it('returns null for integer widening (int → bigint)', () => {
    expect(detectFieldTypeRisk('int', 'bigint')).toBeNull();
  });

  it('returns null when changing between unknown types', () => {
    expect(detectFieldTypeRisk('customtype', 'othertype')).toBeNull();
  });

  it('detects type_change for json → string', () => {
    const risk = detectFieldTypeRisk('json', 'varchar(255)');
    expect(risk).not.toBeNull();
    expect(risk?.kind).toBe('type_change');
  });

  it('returns null for json → jsonb (same category)', () => {
    expect(detectFieldTypeRisk('json', 'jsonb')).toBeNull();
  });

  it('returns null when same type without args changed', () => {
    expect(detectFieldTypeRisk('text', 'text')).toBeNull();
  });
});
