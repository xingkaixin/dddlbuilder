import { describe, expect, it } from 'vitest';
import { withDefaultEditorSession } from '@ddlbuilder/shared-types';
import {
  validateDocumentFields,
  validateUniqueFieldNames,
} from '@/stores/editorDocumentValidation';
import { createFieldRow } from '@/__tests__/utils/testFactories';

const rows = (...names: string[]) =>
  names.map((fieldName, index) => createFieldRow(`field-${index}`, { fieldName }));

describe('editor document validation', () => {
  it('allows blank editing rows and distinct PostgreSQL names', () => {
    expect(() =>
      validateUniqueFieldNames({ dbType: 'postgresql', rows: rows('UserID', 'userid', '', '') }),
    ).not.toThrow();
  });

  it.each([
    { dbType: 'postgresql' as const, names: ['UserID', '"UserID"'] },
    { dbType: 'mysql' as const, names: ['UserID', 'userid'] },
  ])('rejects equivalent $dbType names', ({ dbType, names }) => {
    expect(() => validateUniqueFieldNames({ dbType, rows: rows(...names) })).toThrow(
      'Duplicate field name',
    );
  });

  it('uses the same identifier rules for index references', () => {
    const state = withDefaultEditorSession({
      dbType: 'postgresql',
      tableName: 'users',
      schemaName: '',
      tableComment: '',
      authInput: '',
      authObjects: [],
      rows: rows('UserID'),
      indexes: [
        { id: 'index', name: 'idx', fields: [{ name: 'userid', direction: 'ASC' }], kind: 'index' },
      ],
    });
    expect(() => validateDocumentFields(state)).toThrow('Unknown index field: userid');
    state.indexes[0].fields[0].name = '"UserID"';
    expect(() => validateDocumentFields(state)).not.toThrow();
  });
});
