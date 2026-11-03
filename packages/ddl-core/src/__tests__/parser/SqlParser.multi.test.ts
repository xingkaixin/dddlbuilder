import { describe, expect, it } from 'vitest';
import { SqlParser } from '../../parser/SqlParser.js';

describe('SqlParser.parseMultiAsync', () => {
  it('CREATE INDEX 关联到正确表', async () => {
    const sql = `
      CREATE TABLE users (id INT, name VARCHAR(50));
      CREATE TABLE orders (id INT, user_id INT);
      CREATE INDEX idx_users_name ON users (name);
      CREATE INDEX idx_orders_user_id ON orders (user_id);
    `;
    const parser = new SqlParser();
    const { results } = await parser.parseMultiAsync(sql, 'mysql');

    const users = results.find((r) => r.tableName === 'users');
    const orders = results.find((r) => r.tableName === 'orders');

    expect(users?.indexes.some((i) => i.name === 'idx_users_name')).toBe(true);
    expect(orders?.indexes.some((i) => i.name === 'idx_orders_user_id')).toBe(true);
    expect(users?.indexes.some((i) => i.name === 'idx_orders_user_id')).toBe(false);
  });

  it('Oracle 注释只应用到目标表', async () => {
    const sql = `
      CREATE TABLE alpha (id NUMBER);
      CREATE TABLE beta (id NUMBER);
      COMMENT ON TABLE alpha IS 'Alpha table';
      COMMENT ON COLUMN alpha.id IS 'Alpha id';
      COMMENT ON TABLE beta IS 'Beta table';
      COMMENT ON COLUMN beta.id IS 'Beta id';
    `;
    const parser = new SqlParser();
    const { results } = await parser.parseMultiAsync(sql, 'oracle');

    const alpha = results.find((result) => result.tableName === 'alpha');
    const beta = results.find((result) => result.tableName === 'beta');
    expect(alpha?.tableComment).toBe('Alpha table');
    expect(alpha?.fields[0].comment).toBe('Alpha id');
    expect(beta?.tableComment).toBe('Beta table');
    expect(beta?.fields[0].comment).toBe('Beta id');
  });

  it('字符串和注释里的 COMMENT ON 文本不作为注释语句', async () => {
    const parser = new SqlParser();

    const postgres = await parser.parseMultiAsync(
      `CREATE TABLE t (id INT, note TEXT DEFAULT $$COMMENT ON TABLE t IS 'wrong';$$);
      -- COMMENT ON TABLE t IS 'line';
      /* COMMENT ON COLUMN t.id IS 'block'; */
      COMMENT ON COLUMN t.note IS 'real';`,
      'postgresql',
    );
    expect(postgres.failed).toEqual([]);
    expect(postgres.results[0].tableComment).toBe('');
    expect(postgres.results[0].fields.map((field) => [field.comment, field.defaultValue])).toEqual([
      ['', ''],
      ['real', "$$COMMENT ON TABLE t IS 'wrong';$$"],
    ]);

    const mysql = await parser.parseMultiAsync(
      "CREATE TABLE t (id INT); /* COMMENT ON COLUMN t.id IS 'block'; */",
      'mysql',
    );
    expect(mysql.results[0].fields[0].comment).toBe('');

    const oracle = await parser.parseMultiAsync(
      `CREATE TABLE t (id INT, note VARCHAR2(100) DEFAULT 'COMMENT ON TABLE t IS '''';');
      -- COMMENT ON TABLE t IS 'line';
      /* COMMENT ON COLUMN t.id IS 'block'; */
      COMMENT ON COLUMN t.note IS 'real';`,
      'oracle',
    );
    expect(oracle.failed).toEqual([]);
    expect(oracle.results[0].tableComment).toBe('');
    expect(oracle.results[0].fields.map((field) => [field.comment, field.defaultValue])).toEqual([
      ['', ''],
      ['real', "COMMENT ON TABLE t IS '';"],
    ]);
  });

  it('单表入口拒绝多个 CREATE TABLE', async () => {
    const parser = new SqlParser();
    await expect(
      parser.parseAsync('CREATE TABLE alpha (id INT); CREATE TABLE beta (id INT);', 'mysql'),
    ).rejects.toThrow('检测到多个 CREATE TABLE，请使用 parseMultiAsync() 方法。');
  });
});
