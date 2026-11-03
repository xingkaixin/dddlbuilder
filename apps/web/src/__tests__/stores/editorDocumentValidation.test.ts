import { describe, expect, it } from 'vitest';
import { validateUniqueFieldNames } from '@/stores/editorDocumentValidation';
import { createFieldRow } from '@/__tests__/utils/testFactories';

const rows = (...names: string[]) =>
  names.map((fieldName, index) => createFieldRow(`field-${index}`, { fieldName }));

describe('editor document validation', () => {
  it.each([
    { dbType: 'postgresql' as const, names: ['UserID', '"UserID"'] },
    { dbType: 'mysql' as const, names: ['UserID', 'userid'] },
  ])('rejects equivalent $dbType names', ({ dbType, names }) => {
    expect(() => validateUniqueFieldNames({ dbType, rows: rows(...names) })).toThrow(
      'Duplicate field name',
    );
  });
});
