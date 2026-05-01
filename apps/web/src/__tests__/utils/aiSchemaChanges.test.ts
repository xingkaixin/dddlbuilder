import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { GeneratedTableSchema } from '@ddlbuilder/shared-types/ai-generate';
import { buildAISchemaChanges, buildCandidateStateFromAISchema } from '@/utils/aiSchemaChanges';

function createBaseState(): PersistedState {
  return {
    objectType: 'table',
    schemaName: '',
    tableName: 'users',
    tableComment: '用户',
    dbType: 'mysql',
    sqlFormatMode: 'compact',
    rows: [
      {
        order: 1,
        fieldName: 'id',
        fieldType: 'bigint',
        fieldComment: 'ID',
        nullable: '否',
        defaultKind: '自增',
        defaultValue: '',
        onUpdate: '无',
      },
      {
        order: 2,
        fieldName: 'phone',
        fieldType: 'varchar(32)',
        fieldComment: '手机号',
        nullable: '否',
        defaultKind: '无',
        defaultValue: '',
        onUpdate: '无',
      },
    ],
    addCount: 10,
    indexInput: '',
    currentIndexFields: [],
    indexes: [
      {
        id: 'idx-phone',
        name: 'uk_users_phone',
        fields: [{ name: 'phone', direction: 'ASC' }],
        unique: true,
      },
    ],
    authInput: '',
    authObjects: [],
    foreignKeys: [],
  };
}

describe('aiSchemaChanges', () => {
  it('builds reviewable changes from an AI candidate schema', () => {
    const baseState = createBaseState();
    const schema: GeneratedTableSchema = {
      tableName: 'user_accounts',
      tableComment: '用户账户',
      fields: [
        {
          fieldName: 'id',
          fieldType: 'bigint',
          fieldComment: 'ID',
          nullable: '否',
          defaultKind: '自增',
          onUpdate: '无',
          isPrimaryKey: true,
        },
        {
          fieldName: 'phone',
          fieldType: 'varchar(64)',
          fieldComment: '手机号',
          nullable: '否',
          defaultKind: '无',
          onUpdate: '无',
        },
        {
          fieldName: 'deleted_at',
          fieldType: 'datetime',
          fieldComment: '软删除时间',
          nullable: '是',
          defaultKind: '无',
          onUpdate: '无',
        },
      ],
      indexes: [
        {
          name: 'uk_users_phone',
          fields: [
            { name: 'phone', direction: 'ASC' },
            { name: 'deleted_at', direction: 'ASC' },
          ],
          unique: true,
        },
      ],
    };

    const candidateState = buildCandidateStateFromAISchema(baseState, schema);
    const changes = buildAISchemaChanges(baseState, candidateState);

    expect(changes.map((change) => change.id)).toEqual(
      expect.arrayContaining([
        'table:table_name',
        'table:table_comment',
        'field:modify:phone:phone',
        'field:add::deleted_at',
        'index:modify:uk_users_phone',
        'index:add:PRIMARY',
      ]),
    );
    expect(candidateState.indexes.find((index) => index.name === 'uk_users_phone')?.id).toBe(
      'idx-phone',
    );
  });
});
