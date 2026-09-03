import { describe, expect, it } from 'vitest';
import { TYPE_MAPPINGS } from '../../configs/typeMappings.js';
import type { ParsedFieldType } from '@ddlbuilder/shared-types';
import { applyTransform } from './typeMappingTestHelpers.js';

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
    expect(applyTransform(TYPE_MAPPINGS.mariadb.serial, parsed)).toBe(
      'BIGINT UNSIGNED AUTO_INCREMENT',
    );
    expect(applyTransform(TYPE_MAPPINGS.tidb.serial, parsed)).toBe(
      'BIGINT UNSIGNED AUTO_INCREMENT',
    );
    expect(applyTransform(TYPE_MAPPINGS.oceanbase.serial, parsed)).toBe(
      'BIGINT UNSIGNED AUTO_INCREMENT',
    );
  });

  it('should expose serial transform for dm', () => {
    expect(applyTransform(TYPE_MAPPINGS.dm.serial, parsed)).toBe('BIGINT IDENTITY(1,1)');
  });
});
