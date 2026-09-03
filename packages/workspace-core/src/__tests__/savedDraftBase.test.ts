import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { withDefaultEditorSession } from '@ddlbuilder/shared-types';
import {
  buildSchemaStateSignature,
  decodeSavedDraftBase,
  getWorkspaceSavedDraft,
  upsertWorkspaceSavedDraft,
  upsertWorkspaceSavedTable,
} from '../index';

const base = withDefaultEditorSession({
  schemaName: '',
  tableName: 'users',
  tableComment: 'original',
  dbType: 'mysql',
  rows: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('saved draft baselines', () => {
  it('decodes legacy JSON into a structured baseline and bounded signature', () => {
    const decoded = decodeSavedDraftBase({ baseSignature: JSON.stringify(base) });
    expect(decoded.baseSignature).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(decoded.baseState).toMatchObject({ tableComment: 'original' });
    expect(decoded.baseState).not.toHaveProperty('sqlFormatMode');
  });

  it('keeps the original merge base when the saved table advances', () => {
    const doc = new Y.Doc();
    const record = {
      tableId: 'users',
      normalizedName: 'users',
      name: 'Users',
      state: base,
      createdAt: 1,
      updatedAt: 1,
    };
    upsertWorkspaceSavedTable(doc, record);
    upsertWorkspaceSavedDraft(doc, {
      ...record,
      tableName: 'Users',
      state: { ...base, tableComment: 'draft' },
      baseSignature: buildSchemaStateSignature(base),
    });
    upsertWorkspaceSavedTable(doc, {
      ...record,
      state: { ...base, schemaName: 'remote' },
      updatedAt: 2,
    });
    expect(getWorkspaceSavedDraft(doc, record)?.baseState).toMatchObject({
      schemaName: '',
      tableComment: 'original',
    });
    doc.destroy();
  });
});
