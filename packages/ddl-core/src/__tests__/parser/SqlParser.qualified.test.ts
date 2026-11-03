import { describe, expect, it } from 'vitest';
import { SqlParser } from '../../parser/SqlParser.js';
import { buildDDL } from '../../utils/ddlGenerators.js';

describe('qualified table ownership', () => {
  it('PostgreSQL 区分加引号的表名并保留对应的索引、外键、注释与授权', async () => {
    const { results, failed } = await new SqlParser().parseMultiAsync(
      `
      CREATE TABLE public."Users" ("ID" INT, note VARCHAR(20) DEFAULT 'KeepCase');
      CREATE TABLE public.users (id INT);
      CREATE INDEX mixed_idx ON public."Users" ("ID");
      CREATE INDEX lower_idx ON PUBLIC.Users (ID);
      ALTER TABLE public."Users" ADD CONSTRAINT mixed_fk FOREIGN KEY ("ID") REFERENCES public.users(id);
      COMMENT ON TABLE public."Users" IS 'Mixed';
      COMMENT ON COLUMN public."Users"."ID" IS 'Mixed ID';
      COMMENT ON TABLE PUBLIC.Users IS 'Lower';
      COMMENT ON COLUMN PUBLIC.Users.ID IS 'Lower ID';
      GRANT SELECT ON public."Users" TO mixed_reader;
      GRANT SELECT ON PUBLIC.Users TO lower_reader;
      `,
      'postgresql',
    );
    expect(failed).toEqual([]);
    expect(
      results.map((result) => ({
        name: result.tableName,
        comment: result.tableComment,
        fieldComment: result.fields[0].comment,
        indexes: result.indexes.map((index) => index.name),
        foreignKeys: result.foreignKeys.map((key) => key.name),
        grants: result.authObjects,
      })),
    ).toEqual([
      {
        name: 'Users',
        comment: 'Mixed',
        fieldComment: 'Mixed ID',
        indexes: ['mixed_idx'],
        foreignKeys: ['mixed_fk'],
        grants: ['mixed_reader'],
      },
      {
        name: 'users',
        comment: 'Lower',
        fieldComment: 'Lower ID',
        indexes: ['lower_idx'],
        foreignKeys: [],
        grants: ['lower_reader'],
      },
    ]);
    expect(results[0].fields[1].defaultValue).toBe('KeepCase');
  });

  it.each(['oracle'] as const)('%s 区分加引号的表列名并保留对应的索引与注释', async (dbType) => {
    const { results, failed } = await new SqlParser().parseMultiAsync(
      `
      CREATE TABLE "Foo" ("ID" INT);
      CREATE TABLE "foo" ("id" INT);
      CREATE INDEX "FooIx" ON "Foo" ("ID");
      CREATE INDEX "fooIx" ON "foo" ("id");
      COMMENT ON TABLE "Foo" IS 'Upper';
      COMMENT ON COLUMN "Foo"."ID" IS 'Upper ID';
      COMMENT ON TABLE "foo" IS 'Lower';
      COMMENT ON COLUMN "foo"."id" IS 'Lower id';
      `,
      dbType,
    );

    expect(failed).toEqual([]);
    expect(
      results.map((result) => ({
        tableName: result.tableName,
        tableComment: result.tableComment,
        fieldName: result.fields[0].name,
        fieldComment: result.fields[0].comment,
        indexes: result.indexes.map((index) => index.name),
      })),
    ).toEqual([
      {
        tableName: '"Foo"',
        tableComment: 'Upper',
        fieldName: '"ID"',
        fieldComment: 'Upper ID',
        indexes: ['"FooIx"'],
      },
      {
        tableName: '"foo"',
        tableComment: 'Lower',
        fieldName: '"id"',
        fieldComment: 'Lower id',
        indexes: ['"fooIx"'],
      },
    ]);
  });

  it.each(['oracle', 'dm'] as const)('%s 无损往返特殊引用名称及其归属信息', async (dbType) => {
    const sql = `
        CREATE TABLE "Mi X"."Ta$B" (
          "Co\`L" INT PRIMARY KEY,
          "Uni#que" INT UNIQUE,
          "Copy" INT DEFAULT ("Co\`L" + 1)
        );
        CREATE INDEX "ix\`tick" ON "Mi X"."Ta$B" ("Co\`L");
        COMMENT ON TABLE "Mi X"."Ta$B" IS 'Special table';
        COMMENT ON COLUMN "Mi X"."Ta$B"."Co\`L" IS 'Special column';
        COMMENT ON COLUMN "Mi X"."Ta$B"."Uni#que" IS 'Hash column';
        GRANT SELECT ON "Mi X"."Ta$B" TO report_reader;
      `;
    const parsed = await new SqlParser().parseMultiAsync(sql, dbType);

    expect(parsed.failed).toEqual([]);
    expect(parsed.results).toHaveLength(1);
    const result = parsed.results[0];
    expect(result).toMatchObject({
      schemaName: '"Mi X"',
      tableName: '"Ta$B"',
      tableComment: 'Special table',
      authObjects: ['report_reader'],
    });
    expect(result.fields.map((field) => [field.name, field.comment])).toEqual([
      ['"Co`L"', 'Special column'],
      ['"Uni#que"', 'Hash column'],
      ['"Copy"', ''],
    ]);
    expect(result.fields[2].defaultValue).toBe('("Co`L" + 1)');
    expect(JSON.stringify(result)).not.toContain('__ddlbuilder_oracle_identifier_');
    expect(result.indexes.map((index) => index.name)).toEqual([
      'pk_Ta$B',
      'uk_Uni_que',
      '"ix`tick"',
    ]);

    const generated = buildDDL({
      dbType,
      tableName: `${result.schemaName}.${result.tableName}`,
      tableComment: result.tableComment,
      fields: result.fields,
      indexes: result.indexes,
    });
    const reparsed = await new SqlParser().parseMultiAsync(generated, dbType);
    expect(reparsed.failed).toEqual([]);
    expect(reparsed.results[0]).toMatchObject({
      schemaName: result.schemaName,
      tableName: result.tableName,
      tableComment: result.tableComment,
    });
    expect(reparsed.results[0].fields.map((field) => [field.name, field.comment])).toEqual(
      result.fields.map((field) => [field.name, field.comment]),
    );
    expect(reparsed.results[0].fields[2].defaultValue).toBe(result.fields[2].defaultValue);
    expect(reparsed.results[0].indexes.map((index) => index.name)).toEqual(
      result.indexes.map((index) => index.name),
    );
  });

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
});
