import { describe, expect, it } from 'vitest';
import {
  generateAlterDDL as generateAlterDDLFromCompat,
  generateRollbackDDL as generateRollbackDDLFromCompat,
} from '@/utils/alterDdlGenerator';
import {
  generateAlterDDL as generateAlterDDLFromModule,
  generateRollbackDDL as generateRollbackDDLFromModule,
} from '@ddlbuilder/ddl-core';
import * as constantsCompat from '@/utils/constants';
import { COLUMN_HEADERS, STORAGE_KEY } from '@/utils/constants/index';

describe('compat barrels', () => {
  it('should re-export alter ddl functions from compat entry', () => {
    expect(generateAlterDDLFromCompat).toBe(generateAlterDDLFromModule);
    expect(generateRollbackDDLFromCompat).toBe(generateRollbackDDLFromModule);
  });

  it('should re-export constants from compat entry', () => {
    expect(constantsCompat.STORAGE_KEY).toBe(STORAGE_KEY);
    expect(constantsCompat.COLUMN_HEADERS).toBe(COLUMN_HEADERS);
  });
});
