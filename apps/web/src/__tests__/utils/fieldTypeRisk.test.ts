import { describe, it, expect } from 'vitest';
import { detectFieldTypeRisk } from '@/utils/fieldTypeRisk';

describe('detectFieldTypeRisk', () => {
  it('detects length_shrink when varchar length is reduced', () => {
    const risk = detectFieldTypeRisk('varchar(255)', 'varchar(100)');
    expect(risk).not.toBeNull();
    expect(risk?.kind).toBe('length_shrink');
    expect(risk?.fromType).toBe('varchar(255)');
    expect(risk?.toType).toBe('varchar(100)');
  });

  it('detects type_change for string → integer', () => {
    const risk = detectFieldTypeRisk('varchar(255)', 'int');
    expect(risk).not.toBeNull();
    expect(risk?.kind).toBe('type_change');
  });

  it('detects length_shrink when narrowing integer storage width', () => {
    const risk = detectFieldTypeRisk('bigint', 'int');
    expect(risk).toEqual({
      kind: 'length_shrink',
      fromType: 'bigint',
      toType: 'int',
    });
  });

  it('treats Object.prototype property names as unknown types', () => {
    expect(detectFieldTypeRisk('varchar(255)', 'constructor')).toBeNull();
    expect(detectFieldTypeRisk('bigint', 'toString')).toBeNull();
    expect(detectFieldTypeRisk('constructor', 'toString')).toBeNull();
  });
});
