import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { betterAuthSchema } from '@ddlbuilder/db';
import { createSqliteD1Database } from '../helpers/sqliteD1.js';

describe('auth schema migration parity', () => {
  it.each(Object.values(betterAuthSchema))('matches the migrated indexes for %#', (table) => {
    const { sqlite } = createSqliteD1Database();
    try {
      const config = getTableConfig(table);
      const expected = sqlite
        .prepare(`PRAGMA index_list("${config.name}")`)
        .all()
        .filter((index) => String(index.name).startsWith('idx_'))
        .map((index) => ({ name: index.name, unique: Boolean(index.unique) }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const actual = config.indexes
        .map((index) => ({ name: index.config.name, unique: index.config.unique }))
        .sort((a, b) => a.name.localeCompare(b.name));
      expect(actual).toEqual(expected);
    } finally {
      sqlite.close();
    }
  });
  it('defaults local account issuers to an empty string', () => {
    expect(betterAuthSchema.account.issuer.default).toBe('');
  });
});
