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
});
