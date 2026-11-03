import { describe, it, expect } from 'vitest';
import { DATABASE_TYPES } from '@ddlbuilder/shared-types';
import { SqlParser } from '../../parser/SqlParser.js';

const stripIndexIds = (indexes: any[]) =>
  indexes.map(({ name, fields, kind }) => ({ name, fields, kind }));

describe('SqlParser', () => {
  it('distinguishes string literals from SQL expressions without losing their contents', async () => {
    const result = await new SqlParser().parseAsync(
      "CREATE TABLE defaults_test(literal TEXT DEFAULT 'now()', empty_text TEXT DEFAULT '', padded TEXT DEFAULT ' padded ', author TEXT DEFAULT 'O''Reilly', computed TEXT DEFAULT lower('HELLO'), amount INTEGER DEFAULT (1 + 2));",
      'postgresql',
    );
    expect(
      result.fields.map(({ name, defaultKind, defaultValue }) => ({
        name,
        defaultKind,
        defaultValue,
      })),
    ).toEqual([
      { name: 'literal', defaultKind: 'constant', defaultValue: 'now()' },
      { name: 'empty_text', defaultKind: 'constant', defaultValue: '' },
      { name: 'padded', defaultKind: 'constant', defaultValue: ' padded ' },
      { name: 'author', defaultKind: 'constant', defaultValue: "O'Reilly" },
      { name: 'computed', defaultKind: 'expression', defaultValue: "lower('HELLO')" },
      { name: 'amount', defaultKind: 'expression', defaultValue: '(1 + 2)' },
    ]);
  });

  describe.each(['mysql', 'sqlserver'] as const)('%s 显式主键名称', (dbType) => {
    it.each([
      'CREATE TABLE users (id INT, CONSTRAINT users_identity PRIMARY KEY (id));',
      'CREATE TABLE users (id INT); ALTER TABLE users ADD CONSTRAINT users_identity PRIMARY KEY (id);',
    ])('保留约束名称：%s', async (sql) => {
      const result = await new SqlParser().parseAsync(sql, dbType);
      expect(result.indexes).toEqual([
        expect.objectContaining({
          name: 'users_identity',
          kind: 'primary',
          fields: [{ name: 'id', direction: 'ASC' }],
        }),
      ]);
      expect(result.fields[0].nullable).toBe(false);
    });
  });

  it.each(
    DATABASE_TYPES.filter((databaseType) => databaseType !== 'hive' && databaseType !== 'sqlite'),
  )('能够使用 %s 的兼容方言解析基础建表语句', async (databaseType) => {
    const parser = new SqlParser();

    const result = await parser.parseAsync('CREATE TABLE users (id INT);', databaseType);

    expect(result.tableName).toBe('users');
    expect(result.fields[0]).toMatchObject({ name: 'id', type: 'INT' });
  });

  it('能够解析 MySQL 的表结构、索引与授权', async () => {
    const sql = `
    CREATE TABLE users (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
      name VARCHAR(50) NOT NULL DEFAULT 'anonymous' COMMENT '姓名',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '创建时间',
      uuid_col CHAR(36) DEFAULT uuid(),
      email VARCHAR(100) NULL,
      UNIQUE KEY uk_email (email),
      INDEX idx_name (name DESC)
    ) COMMENT='用户表';
    CREATE INDEX idx_created_at ON users (created_at);
    GRANT SELECT ON users TO 'app_user';
    `;

    const parser = new SqlParser();
    const result = await parser.parseAsync(sql, 'mysql');

    expect(result.tableName).toBe('users');
    expect(result.tableComment).toBe('用户表');
    expect(result.fields).toEqual([
      {
        name: 'id',
        type: 'INT',
        comment: '主键',
        nullable: false,
        defaultKind: 'auto_increment',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'name',
        type: 'VARCHAR(50)',
        comment: '姓名',
        nullable: false,
        defaultKind: 'constant',
        defaultValue: 'anonymous',
        onUpdate: 'none',
      },
      {
        name: 'created_at',
        type: 'TIMESTAMP',
        comment: '创建时间',
        nullable: false,
        defaultKind: 'current_timestamp',
        defaultValue: '',
        onUpdate: 'current_timestamp',
      },
      {
        name: 'uuid_col',
        type: 'CHAR(36)',
        comment: '',
        nullable: true,
        defaultKind: 'uuid',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'email',
        type: 'VARCHAR(100)',
        comment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ]);
    expect(stripIndexIds(result.indexes)).toEqual([
      {
        name: 'pk_users',
        fields: [{ name: 'id', direction: 'ASC' }],
        kind: 'primary',
      },
      {
        name: 'uk_email',
        fields: [{ name: 'email', direction: 'ASC' }],
        kind: 'unique_constraint',
      },
      {
        name: 'idx_name',
        fields: [{ name: 'name', direction: 'DESC' }],
        kind: 'index',
      },
      {
        name: 'idx_created_at',
        fields: [{ name: 'created_at', direction: 'ASC' }],
        kind: 'index',
      },
    ]);
    expect(result.authObjects).toEqual(['app_user']);
  });

  it('能够解析 SQL Server 的标识列和唯一索引', async () => {
    const sql = `
    CREATE TABLE dbo.Users (
      Id INT IDENTITY(1,1) PRIMARY KEY,
      Username NVARCHAR(50) NOT NULL UNIQUE,
      CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
    );
    CREATE UNIQUE INDEX IX_Users_Username ON dbo.Users (Username);
    `;

    const parser = new SqlParser();
    const result = await parser.parseAsync(sql, 'sqlserver');

    expect(result.tableName).toBe('Users');
    expect(result.fields).toEqual([
      {
        name: 'Id',
        type: 'INT',
        comment: '',
        nullable: false,
        defaultKind: 'auto_increment',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'Username',
        type: 'NVARCHAR(50)',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'CreatedAt',
        type: 'DATETIME',
        comment: '',
        nullable: false,
        defaultKind: 'expression',
        defaultValue: 'GETDATE()',
        onUpdate: 'none',
      },
    ]);
    expect(stripIndexIds(result.indexes)).toEqual([
      {
        name: 'pk_Users',
        fields: [{ name: 'Id', direction: 'ASC' }],
        kind: 'primary',
      },
      {
        name: 'uk_Username',
        fields: [{ name: 'Username', direction: 'ASC' }],
        kind: 'unique_constraint',
      },
      {
        name: 'IX_Users_Username',
        fields: [{ name: 'Username', direction: 'ASC' }],
        kind: 'unique_index',
      },
    ]);
  });

  it('Oracle 语法可被预处理后解析（字段注释、主键、索引、授权）', async () => {
    const sql = `
    CREATE TABLE ttt (
      ID VARCHAR2(255),
      INFO_SRC VARCHAR2(255) DEFAULT SYS_GUID(),
      CORP_ID VARCHAR2(32),
      CORP_NAME VARCHAR2(255),
      PUB_DT DATE,
      END_DT DATE,
      INFO_TYP_CD NUMBER(10, null),
      EVA_DESC VARCHAR2(255),
      F_TIME TIMESTAMP DEFAULT SYSTIMESTAMP,
      U_TIME TIMESTAMP DEFAULT SYSTIMESTAMP,
      G_TIME TIMESTAMP DEFAULT SYSTIMESTAMP,
      SOURCE_TYP VARCHAR2(255),
      SOURCE_ID VARCHAR2(255),
      IS_DELETE CHAR(1)
    );
    COMMENT ON TABLE ttt IS 'dfdfdf';
    COMMENT ON COLUMN ttt.ID IS '记录编号';
    COMMENT ON COLUMN ttt.INFO_SRC IS '信息来源';
    COMMENT ON COLUMN ttt.CORP_ID IS '公司编号';
    COMMENT ON COLUMN ttt.CORP_NAME IS '公司名称';
    COMMENT ON COLUMN ttt.PUB_DT IS '发布日期';
    COMMENT ON COLUMN ttt.END_DT IS '截止日期';
    COMMENT ON COLUMN ttt.INFO_TYP_CD IS '信息类别';
    COMMENT ON COLUMN ttt.EVA_DESC IS '评价结果';
    COMMENT ON COLUMN ttt.F_TIME IS '记录进表时间';
    COMMENT ON COLUMN ttt.U_TIME IS '记录更新时间';
    COMMENT ON COLUMN ttt.G_TIME IS '记录落地时间';
    COMMENT ON COLUMN ttt.SOURCE_TYP IS '来源标识';
    COMMENT ON COLUMN ttt.SOURCE_ID IS '来源记录编号';
    COMMENT ON COLUMN ttt.IS_DELETE IS '删除标识';

    ALTER TABLE ttt ADD PRIMARY KEY (ID);
    CREATE UNIQUE INDEX uk_ttt_CORP_ID ON ttt (CORP_ID ASC);
    CREATE INDEX idx_ttt_END_DT ON ttt (END_DT ASC);
    CREATE INDEX idx_ttt_ID_INFO_SRC ON ttt (ID ASC, INFO_SRC ASC);
    CREATE OR REPLACE PUBLIC SYNONYM ttt FOR ttt;
    GRANT SELECT ON ttt TO cbd1;
    GRANT SELECT ON ttt TO cbdd2;
    `;

    const parser = new SqlParser();
    const result = await parser.parseAsync(sql, 'oracle');

    expect(result.tableName).toBe('ttt');
    expect(result.tableComment).toBe('dfdfdf');
    const fieldsByName = Object.fromEntries(result.fields.map((f) => [f.name, f]));
    expect(fieldsByName['ID']).toMatchObject({
      type: 'VARCHAR(255)',
      comment: '记录编号',
      nullable: false,
      defaultKind: 'none',
    });
    expect(fieldsByName['INFO_SRC']).toMatchObject({
      defaultKind: 'uuid',
      comment: '信息来源',
    });
    expect(fieldsByName['INFO_TYP_CD']).toMatchObject({
      type: 'DECIMAL(10)',
      comment: '信息类别',
    });
    expect(fieldsByName['F_TIME']).toMatchObject({
      defaultKind: 'current_timestamp',
      comment: '记录进表时间',
    });
    expect(stripIndexIds(result.indexes)).toEqual([
      {
        name: 'pk_ttt',
        fields: [{ name: 'ID', direction: 'ASC' }],
        kind: 'primary',
      },
      {
        name: 'uk_ttt_CORP_ID',
        fields: [{ name: 'CORP_ID', direction: 'ASC' }],
        kind: 'unique_index',
      },
      {
        name: 'idx_ttt_END_DT',
        fields: [{ name: 'END_DT', direction: 'ASC' }],
        kind: 'index',
      },
      {
        name: 'idx_ttt_ID_INFO_SRC',
        fields: [
          { name: 'ID', direction: 'ASC' },
          { name: 'INFO_SRC', direction: 'ASC' },
        ],
        kind: 'index',
      },
    ]);
    expect(result.authObjects).toEqual(['cbd1', 'cbdd2']);
  });

  it('PostgreSQL COMMENT 语句应被提取到字段与表注释', async () => {
    const sql = `
    CREATE TABLE ttt (
      ID VARCHAR(255) NOT NULL,
      INFO_SRC VARCHAR(255) DEFAULT gen_random_uuid(),
      CORP_ID VARCHAR(32),
      CORP_NAME VARCHAR(255),
      PUB_DT DATE,
      END_DT DATE,
      INFO_TYP_CD NUMERIC(10, 1),
      EVA_DESC VARCHAR(255),
      F_TIME TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      U_TIME TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      G_TIME TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      SOURCE_TYP VARCHAR(255),
      SOURCE_ID VARCHAR(255),
      IS_DELETE CHAR(1)
    );
    COMMENT ON TABLE ttt IS 'dfdfdf';
    COMMENT ON COLUMN ttt.ID IS '记录编号';
    COMMENT ON COLUMN ttt.INFO_SRC IS '信息来源';
    COMMENT ON COLUMN ttt.CORP_ID IS '公司编号';
    COMMENT ON COLUMN ttt.CORP_NAME IS '公司名称';
    COMMENT ON COLUMN ttt.PUB_DT IS '发布日期';
    COMMENT ON COLUMN ttt.END_DT IS '截止日期';
    COMMENT ON COLUMN ttt.INFO_TYP_CD IS '信息类别';
    COMMENT ON COLUMN ttt.EVA_DESC IS '评价结果';
    COMMENT ON COLUMN ttt.F_TIME IS '记录进表时间';
    COMMENT ON COLUMN ttt.U_TIME IS '记录更新时间';
    COMMENT ON COLUMN ttt.G_TIME IS '记录落地时间';
    COMMENT ON COLUMN ttt.SOURCE_TYP IS '来源标识';
    COMMENT ON COLUMN ttt.SOURCE_ID IS '来源记录编号';
    COMMENT ON COLUMN ttt.IS_DELETE IS '删除标识';

    ALTER TABLE ttt ADD PRIMARY KEY (ID);
    CREATE UNIQUE INDEX uk_ttt_CORP_ID ON ttt (CORP_ID ASC);
    CREATE INDEX idx_ttt_END_DT ON ttt (END_DT ASC);
    CREATE INDEX idx_ttt_ID_INFO_SRC ON ttt (ID ASC, INFO_SRC ASC);

    GRANT SELECT ON ttt TO cbd1;
    GRANT SELECT ON ttt TO cbdd2;
    `;

    const parser = new SqlParser();
    const result = await parser.parseAsync(sql, 'postgresql');

    expect(result.tableComment).toBe('dfdfdf');
    const idField = result.fields.find((f) => f.name === 'id');
    expect(idField?.comment).toBe('记录编号');
    expect(result.authObjects).toEqual(['cbd1', 'cbdd2']);
  });

  it('SQL Server 扩展属性注释与授权应被提取', async () => {
    const sql = `
    CREATE TABLE ttt (
      ID VARCHAR(255) NOT NULL,
      INFO_SRC VARCHAR(255) NULL DEFAULT gen_random_uuid(),
      CORP_ID VARCHAR(32) NULL,
      CORP_NAME VARCHAR(255) NULL,
      PUB_DT DATE NULL,
      END_DT DATE NULL,
      INFO_TYP_CD DECIMAL(10, 1) NULL,
      EVA_DESC VARCHAR(255) NULL,
      F_TIME DATETIME2 NULL DEFAULT GETDATE(),
      U_TIME DATETIME2 NULL DEFAULT GETDATE(),
      G_TIME DATETIME2 NULL DEFAULT GETDATE(),
      SOURCE_TYP VARCHAR(255) NULL,
      SOURCE_ID VARCHAR(255) NULL,
      IS_DELETE CHAR(1) NULL
    );
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'dfdfdf',
        @level0type = N'SCHEMA', @level0name = NULL,
        @level1type = N'TABLE', @level1name = N'ttt';
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'记录编号',
        @level0type = N'SCHEMA', @level0name = NULL,
        @level1type = N'TABLE', @level1name = N'ttt',
        @level2type = N'COLUMN', @level2name = N'ID';
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'信息来源',
        @level0type = N'SCHEMA', @level0name = NULL,
        @level1type = N'TABLE', @level1name = N'ttt',
        @level2type = N'COLUMN', @level2name = N'INFO_SRC';

    ALTER TABLE ttt ADD PRIMARY KEY (ID);
    CREATE UNIQUE INDEX uk_ttt_CORP_ID ON ttt (CORP_ID ASC);
    CREATE INDEX idx_ttt_END_DT ON ttt (END_DT ASC);
    CREATE INDEX idx_ttt_ID_INFO_SRC ON ttt (ID ASC, INFO_SRC ASC);

    GRANT SELECT ON ttt TO cbd1;
    GRANT SELECT ON ttt TO cbdd2;
    `;

    const parser = new SqlParser();
    const result = await parser.parseAsync(sql, 'sqlserver');

    expect(result.tableComment).toBe('dfdfdf');
    expect(result.fields.find((f) => f.name === 'ID')?.comment).toBe('记录编号');
    expect(result.fields.find((f) => f.name === 'INFO_SRC')?.comment).toBe('信息来源');
    expect(result.authObjects).toEqual(['cbd1', 'cbdd2']);
  });

  it.each(['mysql', 'postgresql'] as const)('能够解析 %s 的复合外键', async (dbType) => {
    const result = await new SqlParser().parseAsync(
      `CREATE TABLE orders (
        tenant_id INT,
        user_id INT,
        CONSTRAINT orders_user_fk FOREIGN KEY (tenant_id, user_id)
          REFERENCES public.users (tenant_id, id) ON DELETE CASCADE
      );`,
      dbType,
    );

    expect(result.foreignKeys).toEqual([
      expect.objectContaining({
        name: 'orders_user_fk',
        fields: ['tenant_id', 'user_id'],
        refSchema: 'public',
        refTable: 'users',
        refFields: ['tenant_id', 'id'],
        onDelete: 'CASCADE',
      }),
    ]);
  });

  it.each(['mysql', 'postgresql'] as const)('能够解析 %s 的 ALTER TABLE 约束', async (dbType) => {
    const sql = `
    CREATE TABLE orders (
      id INT,
      user_id INT,
      amount DECIMAL(10,2)
    );
    ALTER TABLE orders ADD CONSTRAINT pk_orders PRIMARY KEY (id);
    ALTER TABLE orders ADD CONSTRAINT uk_user_id UNIQUE (user_id);
    ALTER TABLE orders ADD CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users(id);
    `;

    const parser = new SqlParser();
    const result = await parser.parseAsync(sql, dbType);

    expect(result.tableName).toBe('orders');
    expect(result.fields.map((f) => f.name)).toEqual(['id', 'user_id', 'amount']);
    // Primary key should be extracted from ALTER TABLE
    const primaryKey = result.indexes.find((idx) => idx.kind === 'primary');
    expect(primaryKey).toBeDefined();
    expect(primaryKey?.fields).toEqual([{ name: 'id', direction: 'ASC' }]);
    expect(result.foreignKeys).toEqual([
      expect.objectContaining({
        name: 'fk_user_id',
        fields: ['user_id'],
        refTable: 'users',
        refFields: ['id'],
      }),
    ]);
  });

  it('能够解析 MySQL 的 ENGINE、CHARSET、COLLATE 表选项', async () => {
    const sql = `
    CREATE TABLE COO_SC_RAT (
      ID VARCHAR(100) NOT NULL DEFAULT (UUID()) COMMENT '记录编号'
    ) COMMENT='证券公司评级1' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
    `;

    const parser = new SqlParser();
    const result = await parser.parseAsync(sql, 'mysql');

    expect(result.tableName).toBe('COO_SC_RAT');
    expect(result.tableComment).toBe('证券公司评级1');
    expect(result.tableMiscConfig).toEqual({
      enabled: true,
      engine: 'InnoDB',
      charset: 'utf8mb4',
      collation: 'utf8mb4_bin',
      tablespace: '',
    });
  });

  it('能够解析带分区和函数默认值的 MySQL 导入 SQL', async () => {
    const sql = `
    CREATE TABLE COO_SC_RAT (
      ID VARCHAR(100) NULL DEFAULT (UUID()) COMMENT '记录编号',
      INFO_SRC VARCHAR(10) NULL DEFAULT '1' COMMENT '信息来源',
      CORP_ID VARCHAR(32) NULL COMMENT '公司编号',
      CORP_NAME VARCHAR(100) NULL COMMENT '公司名称',
      PUB_DT DATE NULL COMMENT '发布日期',
      END_DT DATE NULL COMMENT '截止日期',
      INFO_TYP_CD DECIMAL(10, 2) NULL COMMENT '信息类别',
      EVA_DESC VARCHAR(100) NULL COMMENT '评价结果',
      F_TIME TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录进表时间',
      U_TIME TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录更新时间',
      G_TIME TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录落地时间',
      SOURCE_TYP VARCHAR(100) NULL COMMENT '来源标识',
      SOURCE_ID VARCHAR(100) NULL COMMENT '来源记录编号',
      IS_DELETE CHAR(1) NULL DEFAULT '1' COMMENT '删除标识',
      aaa TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'dfd'
    ) COMMENT='证券公司评级1'
    PARTITION BY KEY(ID)
    PARTITIONS 4;

    CREATE UNIQUE INDEX uk_COO_SC_RAT_CORP_ID_END_DT ON COO_SC_RAT (CORP_ID ASC, END_DT DESC);
    CREATE INDEX idx_COO_SC_RAT_CORP_ID ON COO_SC_RAT (CORP_ID ASC);
    CREATE INDEX idx_COO_SC_RAT_END_DT ON COO_SC_RAT (END_DT ASC);
    ALTER TABLE COO_SC_RAT ADD CONSTRAINT pk_COO_SC_RAT PRIMARY KEY (ID);
    CREATE INDEX idx_COO_SC_RAT_CORP_ID_ID_SOURCE_TY_g25v ON COO_SC_RAT (CORP_ID ASC, ID ASC, SOURCE_TYP ASC, SOURCE_ID ASC, CORP_NAME ASC);
    CREATE INDEX idx_COO_SC_RAT_ID_CORP_ID_CORP_NAME_o7yc ON COO_SC_RAT (ID ASC, CORP_ID ASC, CORP_NAME ASC, EVA_DESC ASC, END_DT ASC, INFO_SRC ASC, PUB_DT ASC);
    `;

    const parser = new SqlParser();
    const result = await parser.parseAsync(sql, 'mysql');

    expect(result.tableName).toBe('COO_SC_RAT');
    expect(result.tableComment).toBe('证券公司评级1');
    expect(result.fields).toHaveLength(15);
    expect(result.fields.find((f) => f.name === 'ID')?.defaultKind).toBe('uuid');
    expect(result.mysqlPartitionConfig).toEqual({
      enabled: true,
      type: 'KEY',
      columns: ['ID'],
      partitionCount: 4,
      partitions: [],
      expression: undefined,
    });
    expect(result.indexes.map((idx) => idx.name)).toEqual(
      expect.arrayContaining([
        'pk_COO_SC_RAT',
        'uk_COO_SC_RAT_CORP_ID_END_DT',
        'idx_COO_SC_RAT_CORP_ID',
        'idx_COO_SC_RAT_END_DT',
        'idx_COO_SC_RAT_CORP_ID_ID_SOURCE_TY_g25v',
        'idx_COO_SC_RAT_ID_CORP_ID_CORP_NAME_o7yc',
      ]),
    );
  });
});
