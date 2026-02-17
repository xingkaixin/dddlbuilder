import { describe, expect, it } from 'vitest';
import { TYPE_MAPPINGS } from '@/configs/typeMappings';
import type { ParsedFieldType } from '@/types';

const parsed: ParsedFieldType = {
  baseType: 'serial',
  args: [],
  unsigned: false,
  raw: 'serial',
};

describe('TYPE_MAPPINGS config', () => {
  it('should reuse postgresql mappings for postgresql-citus', () => {
    expect(TYPE_MAPPINGS['postgresql-citus']).toBe(TYPE_MAPPINGS.postgresql);
  });

  it('should expose serial transforms for mysql-like databases', () => {
    expect(TYPE_MAPPINGS.mariadb.serial.transform?.(parsed)).toBe(
      'BIGINT UNSIGNED AUTO_INCREMENT',
    );
    expect(TYPE_MAPPINGS.tidb.serial.transform?.(parsed)).toBe(
      'BIGINT UNSIGNED AUTO_INCREMENT',
    );
    expect(TYPE_MAPPINGS.oceanbase.serial.transform?.(parsed)).toBe(
      'BIGINT UNSIGNED AUTO_INCREMENT',
    );
  });

  it('should expose serial transform for dm', () => {
    expect(TYPE_MAPPINGS.dm.serial.transform?.(parsed)).toBe(
      'BIGINT IDENTITY(1,1)',
    );
  });
});
