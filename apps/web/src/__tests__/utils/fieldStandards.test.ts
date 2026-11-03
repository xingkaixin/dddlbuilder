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
