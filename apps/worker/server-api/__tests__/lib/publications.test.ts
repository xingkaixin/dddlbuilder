import { describe, it, expect } from 'vitest';
import { createSqliteD1Database } from '../helpers/sqliteD1';
import {
  readPublication,
  writePublication,
  listPublications,
  deletePublication,
  addPublicationComment,
  readPublicationComments,
  resolvePublicationComment,
} from '../../lib/publications';
import type { PublicationWrite } from '@ddlbuilder/shared-types/api';

const table = {
  schemaName: '',
  tableName: 'users',
  tableComment: 'Users',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [
    {
      id: 'id',
      fieldName: 'id',
      fieldType: 'int',
      fieldComment: '',
      nullable: false,
      standardId: 'amount',
    },
  ],
  indexes: [],
  addCount: 1,
  authInput: 'internal-role-input',
  authObjects: ['internal-role'],
};
const input: PublicationWrite = {
  title: 'Project',
  visibility: 'private',
  revision: 0,
  content: {
    kind: 'document',
    tables: [table],
    standards: [{ id: 'amount', name: 'Amount', unit: 'CNY', description: 'Total' }],
  },
};

function setup() {
  const db = createSqliteD1Database({ includeMeta: true });

  for (const id of ['owner', 'reader'])
    db.sqlite
      .prepare('INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)')
      .run(id, id, `${id}@test.com`, 1, 1);

  return db;
}

describe('schema publications', () => {
  it('retains a stable link and standards while enforcing private access and revision checks', async () => {
    const { database: db, sqlite } = setup();

    try {
      const created = await writePublication(db, 'owner', input);
      expect(created).toMatchObject({
        title: 'Project',
        revision: 1,
        isOwner: true,
        content: { tables: [expect.objectContaining({ authInput: '', authObjects: [] })] },
      });
      await expect(readPublication(db, created.id, null)).rejects.toMatchObject({ status: 404 });
      expect(await listPublications(db, 'reader')).toEqual([]);
      await expect(
        writePublication(db, 'reader', { ...input, revision: 1 }, created.id),
      ).rejects.toMatchObject({ status: 404 });

      const updated = await writePublication(
        db,
        'owner',
        { ...input, visibility: 'link', revision: 1 },
        created.id,
      );
      expect(updated.id).toBe(created.id);
      expect(updated.revision).toBe(2);
      const publicCopy = await readPublication(db, created.id, null);
      expect(publicCopy.isOwner).toBe(false);
      expect(publicCopy.content).toMatchObject({
        standards: input.content.kind === 'document' ? input.content.standards : [],
      });
      await expect(
        writePublication(db, 'owner', { ...input, revision: 1 }, created.id),
      ).rejects.toMatchObject({ status: 409 });
      await writePublication(db, 'owner', { ...input, revision: 2 }, created.id);
      await expect(readPublication(db, created.id, 'reader')).rejects.toMatchObject({
        status: 404,
      });
      expect(await listPublications(db, 'owner')).toHaveLength(1);
      await expect(deletePublication(db, 'reader', created.id)).rejects.toMatchObject({
        status: 404,
      });
      await deletePublication(db, 'owner', created.id);
      await expect(readPublication(db, created.id, 'owner')).rejects.toMatchObject({ status: 404 });
    } finally {
      sqlite.close();
    }
  });

  it('fixes proposal snapshots and limits comment resolution to the owner', async () => {
    const { database: db, sqlite } = setup();

    try {
      const proposal = await writePublication(db, 'owner', {
        ...input,
        visibility: 'link',
        content: { kind: 'proposal', reason: 'Add users', before: [], after: [table], renames: [] },
      });
      await addPublicationComment(
        db,
        proposal.id,
        { userId: 'reader', name: '<script>Reader</script>' },
        'users.id',
        'Review <b>id</b>',
      );
      const [comment] = await readPublicationComments(db, proposal.id, null);
      expect(comment).toMatchObject({ body: 'Review <b>id</b>', resolved: false });
      await expect(
        resolvePublicationComment(db, proposal.id, comment.id, 'reader', true),
      ).rejects.toMatchObject({ status: 404 });
      await resolvePublicationComment(db, proposal.id, comment.id, 'owner', true);
      expect((await readPublicationComments(db, proposal.id, 'owner'))[0].resolved).toBe(true);
      await expect(
        writePublication(db, 'owner', { ...input, revision: 1 }, proposal.id),
      ).rejects.toMatchObject({ status: 400 });
      await writePublication(
        db,
        'owner',
        { title: proposal.title, visibility: 'private', content: proposal.content, revision: 1 },
        proposal.id,
      );
      await expect(
        addPublicationComment(
          db,
          proposal.id,
          { userId: 'reader', name: 'Reader' },
          '',
          'No access',
        ),
      ).rejects.toMatchObject({ status: 404 });
      await deletePublication(db, 'owner', proposal.id);
      expect(
        sqlite.prepare('SELECT COUNT(*) AS count FROM schema_publication_comments').get()?.count,
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });
  it('rejects malformed snapshots before writing and bounds per-account publication storage', async () => {
    const { database: db, sqlite } = setup();

    try {
      await expect(
        writePublication(db, 'owner', {
          ...input,
          content: { kind: 'document', tables: [{}], standards: [] },
        }),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        writePublication(db, 'owner', {
          ...input,
          content: {
            kind: 'document',
            tables: [{ ...table, tableComment: 'x'.repeat(512 * 1024) }],
            standards: [],
          },
        }),
      ).rejects.toMatchObject({ status: 413 });

      for (let i = 0; i < 100; i++) await writePublication(db, 'owner', input);
      await expect(writePublication(db, 'owner', input)).rejects.toMatchObject({
        status: 409,
        code: 'PUBLICATION_LIMIT',
      });
      expect(await listPublications(db, 'owner')).toHaveLength(100);
      expect(await listPublications(db, 'reader')).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
