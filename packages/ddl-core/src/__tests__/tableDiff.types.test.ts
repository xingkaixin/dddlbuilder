import { expectTypeOf, it } from 'vitest';
import type { FieldDiff } from '../utils/tableDiff';

it('rejects field diff variants without their required payload', () => {
  expectTypeOf<{ type: 'add'; fieldName: 'id' }>().not.toExtend<FieldDiff>();
  expectTypeOf<{ type: 'remove'; fieldName: 'id' }>().not.toExtend<FieldDiff>();
  expectTypeOf<{
    type: 'rename';
    fieldName: 'next_id';
    oldFieldName: 'id';
    newFieldName: 'next_id';
  }>().not.toExtend<FieldDiff>();
  expectTypeOf<{
    type: 'modify';
    fieldName: 'id';
    changes: [];
  }>().not.toExtend<FieldDiff>();
});
