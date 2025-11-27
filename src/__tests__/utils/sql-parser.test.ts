import { describe, it, expect } from 'vitest';
import { SqlParser } from '@/utils/SqlParser';

const stripIndexIds = (indexes: any[]) =>
  indexes.map(({ name, fields, unique, isPrimary }) => ({
    name,
    fields,
    unique,
    isPrimary: Boolean(isPrimary),
  }));

describe('SqlParser', () => {
  it('能够解析 MySQL 的表结构、索引与授权', () => {
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
    const result = parser.parse(sql, 'mysql');

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
        unique: true,
        isPrimary: true,
      },
      {
        name: 'uk_email',
        fields: [{ name: 'email', direction: 'ASC' }],
        unique: true,
        isPrimary: false,
      },
      {
        name: 'idx_name',
        fields: [{ name: 'name', direction: 'DESC' }],
        unique: false,
        isPrimary: false,
      },
      {
        name: 'idx_created_at',
        fields: [{ name: 'created_at', direction: 'ASC' }],
        unique: false,
        isPrimary: false,
      },
    ]);
    expect(result.authObjects).toEqual(['app_user']);
  });

  it('能够处理 PostgreSQL 的多语句导入', () => {
    const sql = `
    CREATE TABLE accounts (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) NOT NULL,
      balance NUMERIC(12,2) DEFAULT 0 NOT NULL,
      meta JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT now()
    );
    CREATE UNIQUE INDEX idx_accounts_username ON accounts (username);
    GRANT SELECT ON accounts TO reporting;
    `;

    const parser = new SqlParser();
    const result = parser.parse(sql, 'postgresql');

    expect(result.tableName).toBe('accounts');
    expect(result.fields).toEqual([
      {
        name: 'id',
        type: 'SERIAL',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'username',
        type: 'VARCHAR(50)',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        name: 'balance',
        type: 'NUMERIC(12,2)',
        comment: '',
        nullable: false,
        defaultKind: 'constant',
        defaultValue: '0',
        onUpdate: 'none',
      },
      {
        name: 'meta',
        type: 'JSONB',
        comment: '',
        nullable: true,
        defaultKind: 'constant',
        defaultValue: '{}',
        onUpdate: 'none',
      },
      {
        name: 'created_at',
        type: 'TIMESTAMP',
        comment: '',
        nullable: true,
        defaultKind: 'current_timestamp',
        defaultValue: '',
        onUpdate: 'none',
      },
    ]);
    expect(stripIndexIds(result.indexes)).toEqual([
      {
        name: 'pk_accounts',
        fields: [{ name: 'id', direction: 'ASC' }],
        unique: true,
        isPrimary: true,
      },
      {
        name: 'idx_accounts_username',
        fields: [{ name: 'username', direction: 'ASC' }],
        unique: true,
        isPrimary: false,
      },
    ]);
    expect(result.authObjects).toEqual(['reporting']);
  });

  it('能够解析 SQL Server 的标识列和唯一索引', () => {
    const sql = `
    CREATE TABLE dbo.Users (
      Id INT IDENTITY(1,1) PRIMARY KEY,
      Username NVARCHAR(50) NOT NULL UNIQUE,
      CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
    );
    CREATE UNIQUE INDEX IX_Users_Username ON dbo.Users (Username);
    `;

    const parser = new SqlParser();
    const result = parser.parse(sql, 'sqlserver');

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
        defaultKind: 'constant',
        defaultValue: 'getdate()',
        onUpdate: 'none',
      },
    ]);
    expect(stripIndexIds(result.indexes)).toEqual([
      {
        name: 'pk_Users',
        fields: [{ name: 'Id', direction: 'ASC' }],
        unique: true,
        isPrimary: true,
      },
      {
        name: 'uk_Username',
        fields: [{ name: 'Username', direction: 'ASC' }],
        unique: true,
        isPrimary: false,
      },
      {
        name: 'IX_Users_Username',
        fields: [{ name: 'Username', direction: 'ASC' }],
        unique: true,
        isPrimary: false,
      },
    ]);
  });

  it('支持从 ALTER 语句中抓取主键', () => {
    const sql = `
    CREATE TABLE items (
      id INT,
      name VARCHAR(20)
    );
    ALTER TABLE items ADD PRIMARY KEY (id);
    `;

    const parser = new SqlParser();
    const result = parser.parse(sql, 'mysql');

    expect(result.tableName).toBe('items');
    expect(result.fields.map((f) => f.name)).toEqual(['id', 'name']);
    expect(stripIndexIds(result.indexes)).toEqual([
      {
        name: 'pk_items',
        fields: [{ name: 'id', direction: 'ASC' }],
        unique: true,
        isPrimary: true,
      },
    ]);
  });

  it('Oracle 语法可被预处理后解析（字段注释、主键、索引、授权）', () => {
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
    const result = parser.parse(sql, 'oracle');

    expect(result.tableName).toBe('ttt');
    expect(result.tableComment).toBe('dfdfdf');
    const fieldsByName = Object.fromEntries(
      result.fields.map((f) => [f.name, f]),
    );
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
        unique: true,
        isPrimary: true,
      },
      {
        name: 'uk_ttt_CORP_ID',
        fields: [{ name: 'CORP_ID', direction: 'ASC' }],
        unique: true,
        isPrimary: false,
      },
      {
        name: 'idx_ttt_END_DT',
        fields: [{ name: 'END_DT', direction: 'ASC' }],
        unique: false,
        isPrimary: false,
      },
      {
        name: 'idx_ttt_ID_INFO_SRC',
        fields: [
          { name: 'ID', direction: 'ASC' },
          { name: 'INFO_SRC', direction: 'ASC' },
        ],
        unique: false,
        isPrimary: false,
      },
    ]);
    expect(result.authObjects).toEqual(['cbd1', 'cbdd2']);
  });

  it('PostgreSQL COMMENT 语句应被提取到字段与表注释', () => {
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
    const result = parser.parse(sql, 'postgresql');

    expect(result.tableComment).toBe('dfdfdf');
    const idField = result.fields.find((f) => f.name === 'ID');
    expect(idField?.comment).toBe('记录编号');
    expect(result.authObjects).toEqual(['cbd1', 'cbdd2']);
  });

  it('SQL Server 扩展属性注释与授权应被提取', () => {
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
    const result = parser.parse(sql, 'sqlserver');

    expect(result.tableComment).toBe('dfdfdf');
    expect(result.fields.find((f) => f.name === 'ID')?.comment).toBe(
      '记录编号',
    );
    expect(result.fields.find((f) => f.name === 'INFO_SRC')?.comment).toBe(
      '信息来源',
    );
    expect(result.authObjects).toEqual(['cbd1', 'cbdd2']);
  });
});
