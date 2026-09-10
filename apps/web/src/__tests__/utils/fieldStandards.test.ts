import { afterEach, beforeEach, expect, it } from 'vitest';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from './fakeIndexedDb';
import { createFieldRow, createPersistedState } from './testFactories';
import { decodePersistedState } from '@ddlbuilder/workspace-core';
import {
  applyFieldStandard,
  createFieldStandard,
  decodeFieldStandards,
  deleteFieldStandard,
  fieldStandardDifferences,
  listFieldStandards,
  saveFieldStandards,
} from '@/utils/fieldStandards';

beforeEach(setupFakeIndexedDB);

afterEach(teardownFakeIndexedDB);

it('keeps references through persistence and reports changes without mutating the field', async () => {
  const source = createFieldRow('source', {
    fieldName: 'amount',
    fieldType: 'decimal(18,2)',
    fieldComment: 'Amount',
    nullable: false,
    enumMeta: [{ value: '10', i18n: { 'zh-CN': '十元' } }],
  });
  const standard = createFieldStandard(source);
  standard.unit = 'CNY';
  await saveFieldStandards([standard]);
  const saved = (await listFieldStandards())[0];
  const row = applyFieldStandard({ ...source, id: 'target' }, saved);
  expect(row.id).toBe('target');
  expect(row.standardId).toBe(standard.id);
  expect(fieldStandardDifferences(row, saved)).toEqual([]);
  expect(decodePersistedState(createPersistedState({ rows: [row] }))?.rows[0].standardId).toBe(
    standard.id,
  );
  saved.field.fieldType = 'decimal(20,2)';
  saved.field.enumMeta = [{ value: '20' }];
  await saveFieldStandards([saved]);
  expect(row.enumMeta?.[0].value).toBe('10');
  expect(fieldStandardDifferences(row, saved)).toEqual(['fieldType', 'enumMeta']);
  await deleteFieldStandard(standard.id);
  expect(await listFieldStandards()).toEqual([]);
  expect(row.standardId).toBe(standard.id);

  const imported = decodeFieldStandards(
    JSON.parse(JSON.stringify({ version: 1, standards: [saved] })),
  );
  await saveFieldStandards(imported);
  expect((await listFieldStandards())[0].id).toBe(row.standardId);
});

it('rejects malformed or duplicate imports before writing any standards', async () => {
  const standard = createFieldStandard(
    createFieldRow('id', { fieldName: 'status', fieldType: 'int' }),
  );
  expect(() => decodeFieldStandards({ version: 2, standards: [standard] })).toThrow(
    /Invalid|Incomplete/,
  );
  expect(() => decodeFieldStandards({ version: 1, standards: [standard, standard] })).toThrow(
    /Invalid|Incomplete/,
  );
  await expect(
    saveFieldStandards([
      standard,
      {
        ...standard,
        id: 'invalid',
        // SAFETY: this fixture intentionally injects a legacy string into a boolean field.
        // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- malformed legacy input is intentionally forced through the decoder boundary.
        field: { ...standard.field, nullable: 'no' as unknown as boolean },
      },
    ]),
  ).rejects.toThrow(/Invalid|Incomplete/);
  expect(await listFieldStandards()).toEqual([]);
});

it('compares enum values case-sensitively while ignoring metadata property order', () => {
  const row = createFieldRow('status', {
    fieldName: 'status',
    fieldType: "enum('PAID')",
    enumMeta: [{ value: 'PAID', color: 'green' }],
  });
  const standard = createFieldStandard(row);
  standard.field.enumMeta = [{ color: 'green', value: 'PAID' }];
  expect(fieldStandardDifferences(row, standard)).toEqual([]);
  standard.field.fieldType = "enum('paid')";
  expect(fieldStandardDifferences(row, standard)).toEqual(['fieldType']);
});
