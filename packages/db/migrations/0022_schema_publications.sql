CREATE TABLE schema_publications (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('document', 'proposal')),
  title TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'link')),
  revision INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL CHECK (json_valid(content)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX schema_publications_owner ON schema_publications(owner_id, updated_at);
CREATE TABLE schema_publication_comments (
  id TEXT PRIMARY KEY NOT NULL,
  publication_id TEXT NOT NULL REFERENCES schema_publications(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  target TEXT NOT NULL,
  body TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX schema_publication_comments_order ON schema_publication_comments(publication_id, created_at, id);
