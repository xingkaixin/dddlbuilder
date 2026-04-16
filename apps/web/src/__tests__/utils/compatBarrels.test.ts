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
import {
  COLUMN_HEADERS,
  DEFAULT_KIND_OPTIONS,
  ON_UPDATE_OPTIONS,
  STORAGE_KEY,
  YES_VALUES,
} from '@/utils/constants/index';

describe('compat barrels', () => {
  it('should re-export alter ddl functions from compat entry', () => {
    expect(generateAlterDDLFromCompat).toBe(generateAlterDDLFromModule);
    expect(generateRollbackDDLFromCompat).toBe(generateRollbackDDLFromModule);
  });

  it('should re-export constants from compat entry', () => {
    expect(constantsCompat.STORAGE_KEY).toBe(STORAGE_KEY);
    expect(constantsCompat.COLUMN_HEADERS).toBe(COLUMN_HEADERS);
    expect(constantsCompat.DEFAULT_KIND_OPTIONS).toBe(DEFAULT_KIND_OPTIONS);
    expect(constantsCompat.ON_UPDATE_OPTIONS).toBe(ON_UPDATE_OPTIONS);
    expect(constantsCompat.YES_VALUES).toBe(YES_VALUES);
  });
});
