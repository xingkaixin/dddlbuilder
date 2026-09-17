import * as Schema from 'effect/Schema';
import {
  PublicationSchema,
  PublicationSummarySchema,
  PublicationCommentsSchema,
  type PublicationWrite,
} from '@ddlbuilder/shared-types/api';
import { decodeDeliveryTables } from '@ddlbuilder/workspace-core';
import { compareSchemaSnapshots } from '@ddlbuilder/ddl-core';
import { DomainError } from './http.js';

const summaryColumns = `id, title, kind, visibility, revision, created_at AS createdAt, updated_at AS updatedAt`;

export async function listPublications(db: D1Database, userId: string) {
  const { results } = await db
    .prepare(
      `SELECT ${summaryColumns} FROM schema_publications WHERE owner_id = ? ORDER BY updated_at DESC, id LIMIT 100`,
    )
    .bind(userId)
    .all();

  return Schema.decodeUnknownSync(Schema.Array(PublicationSummarySchema))(results);
}

export async function readPublication(db: D1Database, id: string, userId: string | null) {
  const row = await db
    .prepare(
      `SELECT ${summaryColumns}, content, owner_id FROM schema_publications WHERE id = ? AND (visibility = 'link' OR owner_id = ?)`,
    )
    .bind(id, userId)
    .first<{ content: string; owner_id: string }>();

  if (!row) throw new DomainError(404, 'SHARE_NOT_FOUND', 'Publication not found');

  return Schema.decodeUnknownSync(PublicationSchema)({
    ...row,
    content: JSON.parse(row.content),
    isOwner: row.owner_id === userId,
  });
}

function publicationTables(tables: readonly unknown[]) {
  return decodeDeliveryTables(tables).map((table) => ({
    ...table,
    authInput: '',
    authObjects: [],
  }));
}

function normalizeContent(input: PublicationWrite['content']) {
  try {
    const content =
      input.kind === 'document'
        ? { ...input, tables: publicationTables(input.tables) }
        : {
            ...input,
            before: publicationTables(input.before),
            after: publicationTables(input.after),
          };

    if (content.kind === 'document') {
      const referenced = new Set(
        content.tables.flatMap((table) =>
          table.rows.flatMap((row) => (row.standardId ? [row.standardId] : [])),
        ),
      );
      content.standards = content.standards.filter((standard) => referenced.has(standard.id));
    }

    if (content.kind === 'proposal')
      compareSchemaSnapshots(content.before, content.after, [...content.renames]);

    return content;
  } catch (error) {
    throw new DomainError(
      400,
      'INVALID_JSON',
      error instanceof Error ? error.message : 'Invalid table snapshot',
    );
  }
}

export async function writePublication(
  db: D1Database,
  userId: string,
  input: PublicationWrite,
  id?: string,
) {
  const content = normalizeContent(input.content);
  const now = new Date().toISOString();
  const encoded = JSON.stringify(content);

  if (new TextEncoder().encode(encoded).length > 512 * 1024)
    throw new DomainError(413, 'PAYLOAD_TOO_LARGE', 'Publication content exceeds 512 KiB');

  if (id) {
    const previous = await readPublication(db, id, userId);

    if (!previous.isOwner) throw new DomainError(404, 'SHARE_NOT_FOUND', 'Publication not found');

    if (previous.kind !== content.kind)
      throw new DomainError(400, 'INVALID_JSON', 'Publication kind cannot change');

    if (previous.kind === 'proposal' && JSON.stringify(previous.content) !== encoded)
      throw new DomainError(
        400,
        'INVALID_JSON',
        'Proposal snapshots are immutable; create a new proposal',
      );

    const updated = await db
      .prepare(
        `UPDATE schema_publications SET title = ?, visibility = ?, content = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND revision = ? RETURNING id`,
      )
      .bind(input.title.trim(), input.visibility, encoded, now, id, userId, input.revision)
      .first();

    if (!updated)
      throw new DomainError(
        409,
        'PUBLICATION_CONFLICT',
        'Publication changed; reload before saving',
      );
  } else {
    if (input.revision !== 0)
      throw new DomainError(400, 'INVALID_JSON', 'New publications start at revision zero');
    id = crypto.randomUUID();

    const created = await db
      .prepare(
        `INSERT INTO schema_publications (id, owner_id, kind, title, visibility, content, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM schema_publications WHERE owner_id = ?) < 100 RETURNING id`,
      )
      .bind(
        id,
        userId,
        content.kind,
        input.title.trim(),
        input.visibility,
        encoded,
        now,
        now,
        userId,
      )
      .first();

    if (!created)
      throw new DomainError(409, 'PUBLICATION_LIMIT', 'At most 100 publications per account');
  }

  return readPublication(db, id, userId);
}

export async function deletePublication(db: D1Database, userId: string, id: string) {
  const deleted = await db
    .prepare('DELETE FROM schema_publications WHERE id = ? AND owner_id = ? RETURNING id')
    .bind(id, userId)
    .first();

  if (!deleted) throw new DomainError(404, 'SHARE_NOT_FOUND', 'Publication not found');
}

export async function readPublicationComments(db: D1Database, id: string, userId: string | null) {
  const publication = await readPublication(db, id, userId);

  if (publication.kind !== 'proposal')
    throw new DomainError(400, 'INVALID_JSON', 'Only proposals support comments');

  const { results } = await db
    .prepare(
      `SELECT id, author_name AS author, target, body, resolved, created_at AS createdAt FROM schema_publication_comments WHERE publication_id = ? ORDER BY created_at, id LIMIT 200`,
    )
    .bind(id)
    .all<{ resolved: number }>();

  return Schema.decodeUnknownSync(PublicationCommentsSchema)(
    results.map((row) => ({ ...row, resolved: Boolean(row.resolved) })),
  );
}

export async function addPublicationComment(
  db: D1Database,
  id: string,
  user: { userId: string; name: string },
  target: string,
  body: string,
) {
  const publication = await readPublication(db, id, user.userId);

  if (publication.kind !== 'proposal')
    throw new DomainError(400, 'INVALID_JSON', 'Only proposals support comments');

  const inserted = await db
    .prepare(
      `INSERT INTO schema_publication_comments (id, publication_id, author_id, author_name, target, body, created_at) SELECT ?, id, ?, ?, ?, ?, ? FROM schema_publications WHERE id = ? AND kind = 'proposal' AND (visibility = 'link' OR owner_id = ?) AND (SELECT COUNT(*) FROM schema_publication_comments WHERE publication_id = ?) < 200 RETURNING id`,
    )
    .bind(
      crypto.randomUUID(),
      user.userId,
      user.name,
      target.trim(),
      body.trim(),
      new Date().toISOString(),
      id,
      user.userId,
      id,
    )
    .first();

  if (!inserted)
    throw new DomainError(
      409,
      'PUBLICATION_LIMIT',
      'Comment limit reached or publication access changed',
    );
}

export async function resolvePublicationComment(
  db: D1Database,
  id: string,
  commentId: string,
  userId: string,
  resolved: boolean,
) {
  const updated = await db
    .prepare(
      `UPDATE schema_publication_comments SET resolved = ? WHERE id = ? AND publication_id = ? AND EXISTS (SELECT 1 FROM schema_publications WHERE id = ? AND owner_id = ?) RETURNING id`,
    )
    .bind(Number(resolved), commentId, id, id, userId)
    .first();

  if (!updated) throw new DomainError(404, 'SHARE_NOT_FOUND', 'Comment not found');
}
