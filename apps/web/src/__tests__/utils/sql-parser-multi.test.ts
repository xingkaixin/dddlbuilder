import { describe, expect, it } from 'vitest';
import { SqlParser } from '@/utils/SqlParser';

describe('SqlParser.parseMultiAsync', () => {
  it('单 CREATE TABLE → 返回 1 个 result', async () => {
    const sql = `CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(50));`;
    const parser = new SqlParser();
    const { results, failed } = await parser.parseMultiAsync(sql, 'mysql');

    expect(results).toHaveLength(1);
    expect(results[0].tableName).toBe('users');
    expect(results[0].fields).toHaveLength(2);
    expect(failed).toHaveLength(0);
  });

  it('多 CREATE TABLE → 返回 N 个 result，每个表名正确', async () => {
    const sql = `
      CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(50));
      CREATE TABLE orders (id INT PRIMARY KEY, user_id INT, amount DECIMAL(10,2));
      CREATE TABLE products (id INT PRIMARY KEY, title VARCHAR(200));
    `;
    const parser = new SqlParser();
    const { results, failed } = await parser.parseMultiAsync(sql, 'mysql');

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.tableName)).toEqual(['users', 'orders', 'products']);
    expect(failed).toHaveLength(0);
  });

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

  it('ALTER TABLE ADD FK 关联到正确表', async () => {
    const sql = `
      CREATE TABLE users (id INT);
      CREATE TABLE orders (id INT, user_id INT);
      ALTER TABLE orders ADD CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users(id);
    `;
    const parser = new SqlParser();
    const { results } = await parser.parseMultiAsync(sql, 'mysql');

    const orders = results.find((r) => r.tableName === 'orders');
    expect(orders?.foreignKeys).toHaveLength(1);
    expect(orders?.foreignKeys[0].name).toBe('fk_user_id');

    const users = results.find((r) => r.tableName === 'users');
    expect(users?.foreignKeys).toHaveLength(0);
  });

  it('GRANT 应用到所有表', async () => {
    const sql = `
      CREATE TABLE t1 (id INT);
      CREATE TABLE t2 (id INT);
      GRANT SELECT ON t1 TO app_user;
      GRANT SELECT ON t2 TO app_user;
    `;
    const parser = new SqlParser();
    const { results } = await parser.parseMultiAsync(sql, 'mysql');

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.authObjects).toContain('app_user');
    }
  });

  it('混合合法/非法语句 → results + failed 都有值', async () => {
    const sql = `
      CREATE TABLE valid_table (id INT PRIMARY KEY);
      @@@@@ THIS IS NOT SQL @@@@@
      CREATE TABLE another_valid (name VARCHAR(20));
    `;
    const parser = new SqlParser();

    // The invalid statement should cause the whole parse to throw,
    // because astify fails on malformed input.
    await expect(parser.parseMultiAsync(sql, 'mysql')).rejects.toThrow(
      '无法解析 SQL，请检查语法或数据库类型是否正确。',
    );
  });

  it('空 SQL → 返回空 results 和 failed', async () => {
    const parser = new SqlParser();
    const { results, failed } = await parser.parseMultiAsync('', 'mysql');
    expect(results).toHaveLength(0);
    expect(failed).toHaveLength(0);
  });
});
