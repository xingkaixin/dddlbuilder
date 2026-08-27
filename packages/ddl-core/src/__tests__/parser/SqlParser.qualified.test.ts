import { describe, expect, it } from 'vitest';
import { SqlParser } from '../../parser/SqlParser.js';

describe('qualified table ownership', () => {
  it.each(['mysql', 'postgresql'] as const)('%s 按 schema 关联索引、外键和授权', async (dbType) => {
    const { results, failed } = await new SqlParser().parseMultiAsync(
      `
      CREATE TABLE sales.users (id INT, email VARCHAR(100));
      CREATE TABLE audit.users (id INT, message VARCHAR(100));
      CREATE INDEX sales_email_idx ON sales.users (email);
      CREATE INDEX audit_message_idx ON audit.users (message);
      ALTER TABLE sales.users ADD CONSTRAINT fk_audit FOREIGN KEY (id) REFERENCES audit.users(id);
      GRANT SELECT ON sales.users TO sales_reader;
      GRANT SELECT ON audit.users TO audit_reader;
    `,
      dbType,
    );
    expect(failed).toEqual([]);
    const sales = results.find((result) => result.schemaName === 'sales');
    const audit = results.find((result) => result.schemaName === 'audit');
    expect(sales?.indexes.map((index) => index.name)).toEqual(['sales_email_idx']);
    expect(audit?.indexes.map((index) => index.name)).toEqual(['audit_message_idx']);
    expect(sales?.foreignKeys).toEqual([
      expect.objectContaining({ name: 'fk_audit', refSchema: 'audit' }),
    ]);
    expect(audit?.foreignKeys).toEqual([]);
    expect(sales?.authObjects).toEqual(['sales_reader']);
    expect(audit?.authObjects).toEqual(['audit_reader']);
  });

  it('单表入口不混入另一个 schema 的同名表操作', async () => {
    const result = await new SqlParser().parseAsync(
      `
      CREATE TABLE sales.users (id INT);
      CREATE INDEX audit_idx ON audit.users (id);
      ALTER TABLE audit.users ADD CONSTRAINT fk_other FOREIGN KEY (id) REFERENCES sales.users(id);
      GRANT SELECT ON audit.users TO audit_reader;
      COMMENT ON TABLE audit.users IS 'Other table';
    `,
      'postgresql',
    );
    expect(result.indexes).toEqual([]);
    expect(result.foreignKeys).toEqual([]);
    expect(result.authObjects).toEqual([]);
    expect(result.tableComment).toBe('');
  });

  it.each(['postgresql', 'oracle'] as const)('%s 保留表注释与字段注释的 schema', async (dbType) => {
    const { results } = await new SqlParser().parseMultiAsync(
      `
      CREATE TABLE sales.users (id INT);
      CREATE TABLE audit.users (id INT);
      COMMENT ON TABLE sales.users IS 'Sales';
      COMMENT ON COLUMN sales.users.id IS 'Sales id';
      COMMENT ON TABLE audit.users IS 'Audit';
      COMMENT ON COLUMN audit.users.id IS 'Audit id';
    `,
      dbType,
    );
    expect(
      results.map((result) => [result.schemaName, result.tableComment, result.fields[0].comment]),
    ).toEqual([
      ['sales', 'Sales', 'Sales id'],
      ['audit', 'Audit', 'Audit id'],
    ]);
  });

  it('SQL Server 扩展属性保留 schema', async () => {
    const statements = ['sales', 'audit']
      .map(
        (schema) => `
      CREATE TABLE ${schema}.users (id INT);
      EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'${schema} table',
        @level0type=N'SCHEMA', @level0name=N'${schema}', @level1type=N'TABLE', @level1name=N'users';
      EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'${schema} id',
        @level0type=N'SCHEMA', @level0name=N'${schema}', @level1type=N'TABLE', @level1name=N'users',
        @level2type=N'COLUMN', @level2name=N'id';
    `,
      )
      .join('\n');
    const { results } = await new SqlParser().parseMultiAsync(statements, 'sqlserver');
    expect(
      results.map((result) => [result.schemaName, result.tableComment, result.fields[0].comment]),
    ).toEqual([
      ['sales', 'sales table', 'sales id'],
      ['audit', 'audit table', 'audit id'],
    ]);
  });

  it('MySQL 分区不跨 schema 传播', async () => {
    const { results } = await new SqlParser().parseMultiAsync(
      `
      CREATE TABLE sales.users (id INT) PARTITION BY HASH(id) PARTITIONS 2;
      CREATE TABLE audit.users (id INT) PARTITION BY KEY(id) PARTITIONS 8;
    `,
      'mysql',
    );
    expect(
      results.map((result) => [
        result.schemaName,
        result.mysqlPartitionConfig?.type,
        result.mysqlPartitionConfig?.partitionCount,
      ]),
    ).toEqual([
      ['sales', 'HASH', 2],
      ['audit', 'KEY', 8],
    ]);
  });

  it.each([false, true])('裸表名只在归属明确时关联 (ambiguous=%s)', async (ambiguous) => {
    const { results } = await new SqlParser().parseMultiAsync(
      `
      CREATE TABLE sales.users (id INT);
      ${ambiguous ? 'CREATE TABLE audit.users (id INT);' : ''}
      CREATE INDEX id_idx ON users (id);
      GRANT SELECT ON users TO reader;
      COMMENT ON TABLE users IS 'Users';
    `,
      'postgresql',
    );
    expect(results[0].indexes.map((index) => index.name)).toEqual(ambiguous ? [] : ['id_idx']);
    expect(results[0].authObjects).toEqual(ambiguous ? [] : ['reader']);
    expect(results[0].tableComment).toBe(ambiguous ? '' : 'Users');
    expect(results.slice(1).flatMap((result) => result.indexes)).toEqual([]);
    expect(results.slice(1).flatMap((result) => result.authObjects)).toEqual([]);
  });

  it('引号内的点号不是 schema 分隔符', async () => {
    const { results } = await new SqlParser().parseMultiAsync(
      `
      CREATE TABLE "sales"."users" (id INT);
      CREATE TABLE "sales.users" (id INT);
      CREATE INDEX qualified_idx ON "sales"."users" (id);
      CREATE INDEX dotted_idx ON "sales.users" (id);
      COMMENT ON TABLE "sales"."users" IS 'Qualified';
      COMMENT ON TABLE "sales.users" IS 'Dotted';
    `,
      'postgresql',
    );
    expect(
      results.map((result) => [result.tableComment, result.indexes.map((index) => index.name)]),
    ).toEqual([
      ['Qualified', ['qualified_idx']],
      ['Dotted', ['dotted_idx']],
    ]);
  });
});
