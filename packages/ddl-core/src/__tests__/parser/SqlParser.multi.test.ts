import { describe, expect, it } from 'vitest';
import { SqlParser } from '../../parser/SqlParser.js';

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

  it('GRANT 只应用到目标表', async () => {
    const sql = `
      CREATE TABLE t1 (id INT);
      CREATE TABLE t2 (id INT);
      GRANT SELECT ON t1 TO user_one;
      GRANT SELECT ON t2 TO user_two;
    `;
    const parser = new SqlParser();
    const { results } = await parser.parseMultiAsync(sql, 'mysql');

    expect(results.find((result) => result.tableName === 't1')?.authObjects).toEqual(['user_one']);
    expect(results.find((result) => result.tableName === 't2')?.authObjects).toEqual(['user_two']);
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

  it('MySQL 分区配置只应用到目标表', async () => {
    const sql = `
      CREATE TABLE alpha (id INT)
      PARTITION BY HASH(id) PARTITIONS 2;
      CREATE TABLE beta (id INT)
      PARTITION BY KEY(id) PARTITIONS 8;
    `;
    const parser = new SqlParser();
    const { results } = await parser.parseMultiAsync(sql, 'mysql');

    expect(results.find((result) => result.tableName === 'alpha')?.mysqlPartitionConfig).toEqual(
      expect.objectContaining({ type: 'HASH', partitionCount: 2 }),
    );
    expect(results.find((result) => result.tableName === 'beta')?.mysqlPartitionConfig).toEqual(
      expect.objectContaining({ type: 'KEY', partitionCount: 8 }),
    );
  });

  it('单表入口拒绝多个 CREATE TABLE', async () => {
    const parser = new SqlParser();
    await expect(
      parser.parseAsync('CREATE TABLE alpha (id INT); CREATE TABLE beta (id INT);', 'mysql'),
    ).rejects.toThrow('检测到多个 CREATE TABLE，请使用 parseMultiAsync() 方法。');
  });

  it('混合合法/非法语句 → results + failed 都有值', async () => {
    const sql = `
      CREATE TABLE valid_table (id INT PRIMARY KEY);
      @@@@@ THIS IS NOT SQL @@@@@
      CREATE TABLE another_valid (name VARCHAR(20));
    `;
    const parser = new SqlParser();

    const result = await parser.parseMultiAsync(sql, 'mysql');
    expect(result.results.map((table) => table.tableName)).toEqual(['valid_table']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].statement).toContain('@@@@@');
  });

  it('空 SQL → 返回空 results 和 failed', async () => {
    const parser = new SqlParser();
    const { results, failed } = await parser.parseMultiAsync('', 'mysql');
    expect(results).toHaveLength(0);
    expect(failed).toHaveLength(0);
  });
});
