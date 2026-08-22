import { describe, expect, it } from 'vitest';
import { decodeWorkspaceMigrationPayload } from '../workspaceMigrationCodec';

const state = () => ({
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

const payload = () => ({
  localFingerprint: 'fingerprint-1',
  idempotencyKey: 'migration-1',
  snapshot: {
    globalDraft: null,
    activeSession: null,
    savedTables: [],
    savedDrafts: [],
  },
});

describe('decodeWorkspaceMigrationPayload', () => {
  it('兼容省略 drafts 和 folders 的旧迁移请求', () => {
    expect(decodeWorkspaceMigrationPayload(payload())).toEqual({
      ...payload(),
      snapshot: {
        ...payload().snapshot,
        drafts: [],
        folders: [],
      },
    });
  });

  it('拒绝错误的集合形状', () => {
    const input = payload();
    expect(
      decodeWorkspaceMigrationPayload({
        ...input,
        snapshot: { ...input.snapshot, savedTables: {} },
      }),
    ).toBeNull();
  });

  it('拒绝嵌套的非法持久化状态', () => {
    const input = payload();
    expect(
      decodeWorkspaceMigrationPayload({
        ...input,
        snapshot: {
          ...input.snapshot,
          activeSession: {
            activeSource: { kind: 'draft', draftId: 'draft-1' },
            activeState: { ...state(), rows: 'invalid' },
            updatedAt: 1,
          },
        },
      }),
    ).toBeNull();
  });
});
