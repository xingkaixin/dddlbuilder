import { describe, expect, it } from 'vitest';
import { withDefaultEditorSession, type PersistedState } from '@ddlbuilder/shared-types';
import { resolveSavedTableSnapshot } from '@/services/savedTableSnapshot';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';
import { updateDocumentFields } from '@/stores/editorDocumentMutations';
import { normalizeFields } from '@/utils/helpers';
import { buildDDL } from '@ddlbuilder/ddl-core';
import { decodeSavedDraftBase } from '@ddlbuilder/workspace-core';

const base = withDefaultEditorSession({
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  rows: ['id', 'name'].map((id) => ({
    id,
    fieldName: id,
    fieldType: 'int',
    fieldComment: '',
    nullable: true,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
  })),
  indexes: [],
  authInput: '',
  authObjects: [],
});

const record = (state = base) => ({
  tableId: 'table-users',
  normalizedName: 'users',
  name: 'Users',
  state,
});
const draft = (
  state: PersistedState,
  baseSignature = serializePersistedStateForComparison(base),
  baseState = base,
) => ({
  state,
  ...decodeSavedDraftBase({
    baseSignature,
    ...(baseSignature.startsWith('sha256:') ? { baseState } : {}),
  }),
  tableName: 'Users',
  updatedAt: 1,
});

describe('resolveSavedTableSnapshot', () => {
  it('恢复改名草稿时合并远端索引并生成有效字段引用', () => {
    const saved: PersistedState = {
      ...base,
      indexes: [
        {
          id: 'id-index',
          name: 'idx_id',
          fields: [{ name: 'id', direction: 'ASC' }],
          unique: false,
        },
      ],
    };
    const edited = updateDocumentFields(base, [
      { ...base.rows[0], fieldName: 'account_id' },
      base.rows[1],
    ]);
    const snapshot = resolveSavedTableSnapshot(record(saved), draft(edited));
    const sql = buildDDL({
      dbType: snapshot.state.dbType,
      tableName: snapshot.state.tableName,
      tableComment: snapshot.state.tableComment,
      fields: normalizeFields(snapshot.state.rows),
      indexes: snapshot.state.indexes,
    });
    expect(sql).toContain('INDEX idx_account_id (account_id ASC)');
    expect(sql).not.toContain('(id ASC)');
    expect(
      resolveSavedTableSnapshot(record(saved), draft(snapshot.state, snapshot.source.baseSignature))
        .state,
    ).toEqual(snapshot.state);
  });

  it('无草稿时返回保存状态，基线相同时直接使用草稿', () => {
    expect(resolveSavedTableSnapshot(record(), null).state).toBe(base);
    const edited = { ...base, tableComment: 'draft' };
    expect(resolveSavedTableSnapshot(record(), draft(edited)).state).toBe(edited);
  });

  it('合并独立字段修改，冲突保留草稿且基线指向最新保存版本', () => {
    const saved = {
      ...base,
      schemaName: 'app',
      tableComment: 'saved',
      rows: base.rows.map((row) => ({ ...row, nullable: false })),
      authInput: 'reader',
      authObjects: ['reader'],
    };
    const edited = {
      ...base,
      tableComment: 'draft',
      rows: base.rows.map((row) => ({ ...row, fieldComment: 'draft comment' })),
    };
    const snapshot = resolveSavedTableSnapshot(record(saved), draft(edited));
    expect(snapshot.state).toMatchObject({
      schemaName: 'app',
      tableComment: 'draft',
      authInput: 'reader',
      authObjects: ['reader'],
      rows: [
        { id: 'id', nullable: false, fieldComment: 'draft comment' },
        { id: 'name', nullable: false, fieldComment: 'draft comment' },
      ],
    });
    expect(snapshot.source.baseSignature).toBe(serializePersistedStateForComparison(saved));
    expect(edited.schemaName).toBe('');
    expect(saved.tableComment).toBe('saved');
  });

  it('合并新增和删除行，草稿修改过的行不会被远端删除吞掉', () => {
    const saved = { ...base, rows: [] };
    const edited = {
      ...base,
      rows: [
        { ...base.rows[0], fieldComment: 'draft' },
        { ...base.rows[1], id: 'new', fieldName: 'new' },
      ],
    };
    expect(resolveSavedTableSnapshot(record(saved), draft(edited)).state.rows).toEqual(edited.rows);
    expect(resolveSavedTableSnapshot(record(saved), draft(base)).state.rows).toEqual([]);
  });

  it.each(['invalid', '{}'])('无法读取基线 %s 时保留草稿而不是丢弃', (signature) => {
    const edited = { ...base, tableComment: 'draft' };
    expect(resolveSavedTableSnapshot(record(), draft(edited, signature)).state).toBe(edited);
  });

  it('兼容完整旧快照签名，并在后续保存后继续正确合并', () => {
    const edited = { ...base, tableComment: 'draft' };
    const saved = { ...base, schemaName: 'app' };
    const first = resolveSavedTableSnapshot(record(saved), draft(edited, JSON.stringify(base)));
    const nextSaved = { ...saved, tableName: 'accounts' };
    const next = resolveSavedTableSnapshot(
      record(nextSaved),
      draft({ ...first.state, authInput: 'reader' }, first.source.baseSignature, saved),
    );
    expect(next.state).toMatchObject({
      tableComment: 'draft',
      schemaName: 'app',
      tableName: 'accounts',
      authInput: 'reader',
    });
  });
});
