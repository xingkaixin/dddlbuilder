import { describe, expect, it } from 'vitest';
import {
  BUSINESS_MODULES,
  businessModuleSql,
  instantiateBusinessModule,
} from '../utils/businessModules';

describe('business modules', () => {
  for (const module of BUSINESS_MODULES) {
    it.each(['mysql', 'postgresql'] as const)(
      `${module} creates complete related %s models with fresh identities`,
      (dbType) => {
        for (const strategy of ['integer', 'string'] as const) {
          const tables = instantiateBusinessModule(module, dbType, 'app_', strategy);
          const fresh = instantiateBusinessModule(module, dbType, 'app_', strategy);
          const sql = businessModuleSql(tables);
          expect(sql.lastIndexOf('CREATE TABLE')).toBeLessThan(sql.indexOf('FOREIGN KEY'));
          expect(sql).toContain('UNIQUE');
          expect(fresh[0].rows[0].id).not.toBe(tables[0].rows[0].id);

          for (const table of tables) {
            expect(table.tableName).toMatch(/^app_/);

            for (const relation of table.foreignKeys ?? []) {
              const parent = tables.find((candidate) => candidate.tableName === relation.refTable);
              expect(parent).toBeDefined();
              expect(
                table.rows.find((row) => row.fieldName === relation.fields[0])?.fieldType,
              ).toBe(parent?.rows[0].fieldType);
            }
          }
        }
      },
    );
  }

  it('rejects invalid prefixes before producing a partial module', () => {
    expect(() => instantiateBusinessModule('rbac', 'mysql', 'wrong-prefix', 'integer')).toThrow(
      'prefix',
    );
    expect(() => instantiateBusinessModule('rbac', 'mysql', 'x'.repeat(21), 'integer')).toThrow(
      'prefix',
    );
  });
});
