import { describe, it, expect } from 'vitest';
import { buildDDL, buildDCL, buildOracleSynonyms, buildViewDDL } from '@ddlbuilder/ddl-core';
import type { NormalizedField, IndexDefinition } from '@ddlbuilder/shared-types';

describe('DDL Generation Functions', () => {
  const sampleFields: NormalizedField[] = [
    {
      name: 'id',
      type: 'int',
      comment: '主键ID',
      nullable: false,
      defaultKind: 'auto_increment',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      name: 'name',
      type: 'varchar(255)',
      comment: '名称',
      nullable: true,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      name: 'created_at',
      type: 'timestamp',
      comment: '创建时间',
      nullable: false,
      defaultKind: 'current_timestamp',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      name: 'price',
      type: 'decimal(10,2)',
      comment: '价格',
      nullable: true,
      defaultKind: 'constant',
      defaultValue: '0.00',
      onUpdate: 'none',
    },
  ];

  describe('buildViewDDL', () => {
    it('should generate CREATE OR REPLACE VIEW DDL', () => {
      const result = buildViewDDL('postgresql', 'public.active_users', 'SELECT id FROM users');

      expect(result).toBe('CREATE OR REPLACE VIEW public.active_users AS\nSELECT id FROM users;');
    });

    it('should generate SQL Server CREATE OR ALTER VIEW DDL', () => {
      const result = buildViewDDL('sqlserver', 'dbo.active_users', 'SELECT id FROM dbo.users;');

      expect(result).toBe('CREATE OR ALTER VIEW dbo.active_users AS\nSELECT id FROM dbo.users;');
    });
  });

  describe('buildDDL for MySQL', () => {
    it('should generate basic MySQL DDL', () => {
      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'users',
        tableComment: '用户表',
        fields: sampleFields,
      });

      expect(result).toContain('CREATE TABLE users');
      expect(result).toContain("COMMENT='用户表'");
      expect(result).toContain('id INT AUTO_INCREMENT NOT NULL');
      expect(result).toContain("name VARCHAR(255) NULL COMMENT '名称'");
      expect(result).toContain('created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
      expect(result).toContain("price DECIMAL(10, 2) NULL DEFAULT 0.00 COMMENT '价格'");
    });

    it('should generate DDL for empty table name', () => {
      const result = buildDDL({
        dbType: 'mysql',
        tableName: '',
        tableComment: '用户表',
        fields: sampleFields,
      });
      expect(result).toContain('-- 请填写表名');
    });

    it('should handle empty fields', () => {
      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'users',
        tableComment: '用户表',
        fields: [],
      });
      expect(result).toContain('-- 请补充字段信息');
    });

    it('should handle table comment without comment', () => {
      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'users',
        tableComment: '',
        fields: sampleFields,
      });
      expect(result).toContain('CREATE TABLE users');
      expect(result).not.toContain('COMMENT=');
    });

    it('should ignore precision when rendering timestamp columns', () => {
      const fields: NormalizedField[] = [
        {
          name: 'created_at',
          type: 'timestamp(6)',
          comment: '',
          nullable: false,
          defaultKind: 'current_timestamp',
          defaultValue: '',
          onUpdate: 'none',
        },
      ];

      const result = buildDDL({ dbType: 'mysql', tableName: 'events', tableComment: '', fields });

      expect(result).toContain('created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
      expect(result).not.toContain('TIMESTAMP(6)');
    });

    it('should generate UUID default expression for character columns', () => {
      const fields: NormalizedField[] = [
        {
          name: 'trace_id',
          type: 'uuid',
          comment: '',
          nullable: false,
          defaultKind: 'uuid',
          defaultValue: '',
          onUpdate: 'none',
        },
      ];

      const result = buildDDL({ dbType: 'mysql', tableName: 'events', tableComment: '', fields });

      expect(result).toContain('trace_id CHAR(36) NOT NULL DEFAULT (UUID())');
    });

    it('should include table options when misc config enabled', () => {
      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'users',
        tableComment: '',
        fields: sampleFields,
        indexes: [],
        tableMiscConfig: {
          enabled: true,
          engine: 'InnoDB',
          charset: 'utf8mb4',
          collation: 'utf8mb4_general_ci',
        },
      });

      expect(result).toContain('ENGINE=InnoDB');
      expect(result).toContain('DEFAULT CHARSET=utf8mb4');
      expect(result).toContain('COLLATE=utf8mb4_general_ci');
    });

    it('should align MySQL columns in aligned mode', () => {
      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'users',
        tableComment: '用户表',
        fields: sampleFields,
        indexes: [],
        sqlFormatMode: 'aligned',
      });

      expect(result).toContain(
        "id          INT AUTO_INCREMENT NOT NULL                   COMMENT '主键ID'",
      );
      expect(result).toContain(
        "name        VARCHAR(255) NULL                             COMMENT '名称'",
      );
      expect(result).toContain(
        "price       DECIMAL(10, 2) NULL DEFAULT 0.00              COMMENT '价格'",
      );
    });
  });

  describe('buildDDL for PostgreSQL', () => {
    it('should generate PostgreSQL DDL', () => {
      const result = buildDDL({
        dbType: 'postgresql',
        tableName: 'users',
        tableComment: '用户表',
        fields: sampleFields,
      });

      expect(result).toContain('CREATE TABLE users');
      expect(result).toContain('id INTEGER GENERATED BY DEFAULT AS IDENTITY NOT NULL');
      expect(result).toContain('name VARCHAR(255)');
      expect(result).toContain('created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
      expect(result).toContain('price NUMERIC(10, 2) DEFAULT 0.00');
      expect(result).toContain("COMMENT ON TABLE users IS '用户表'");
      expect(result).toContain("COMMENT ON COLUMN users.name IS '名称'");
    });

    it('should include tablespace when configured', () => {
      const result = buildDDL({
        dbType: 'postgresql',
        tableName: 'users',
        tableComment: '',
        fields: sampleFields,
        indexes: [],
        tableMiscConfig: {
          enabled: true,
          tablespace: 'ts_data',
        },
      });

      expect(result).toContain('TABLESPACE ts_data');
    });

    it('should handle qualified table names', () => {
      const result = buildDDL({
        dbType: 'postgresql',
        tableName: 'public.users',
        tableComment: '用户表',
        fields: sampleFields,
      });
      expect(result).toContain('CREATE TABLE public.users');
      expect(result).toContain('public.users.name');
    });

    it('should align PostgreSQL columns in aligned mode', () => {
      const result = buildDDL({
        dbType: 'postgresql',
        tableName: 'users',
        tableComment: '用户表',
        fields: sampleFields,
        indexes: [],
        sqlFormatMode: 'aligned',
      });

      expect(result).toContain('id          INTEGER GENERATED BY DEFAULT AS IDENTITY NOT NULL');
      expect(result).toContain('created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    });
  });

  describe('buildDDL for SQL Server', () => {
    it('should generate SQL Server DDL', () => {
      const result = buildDDL({
        dbType: 'sqlserver',
        tableName: 'dbo.users',
        tableComment: '用户表',
        fields: sampleFields,
      });

      expect(result).toContain('CREATE TABLE dbo.users');
      expect(result).toContain('id INT IDENTITY(1,1) NOT NULL');
      expect(result).toContain('name VARCHAR(255) NULL');
      expect(result).toContain('created_at DATETIME2 NOT NULL');
      expect(result).toContain('price DECIMAL(10, 2) NULL DEFAULT 0.00');
      expect(result).toContain('EXEC sp_addextendedproperty');
      expect(result).toContain("N'MS_Description'");
    });

    it('should handle schema-less table names', () => {
      const result = buildDDL({
        dbType: 'sqlserver',
        tableName: 'users',
        tableComment: '用户表',
        fields: sampleFields,
      });
      expect(result).toContain('CREATE TABLE users');
    });

    it('should align SQL Server columns in aligned mode', () => {
      const result = buildDDL({
        dbType: 'sqlserver',
        tableName: 'dbo.users',
        tableComment: '用户表',
        fields: sampleFields,
        indexes: [],
        sqlFormatMode: 'aligned',
      });

      expect(result).toContain('id          INT IDENTITY(1,1) NOT NULL');
      expect(result).toContain('price       DECIMAL(10, 2) NULL DEFAULT 0.00');
    });
  });

  describe('buildDDL for Oracle', () => {
    it('should generate Oracle DDL', () => {
      const result = buildDDL({
        dbType: 'oracle',
        tableName: 'users',
        tableComment: '用户表',
        fields: sampleFields,
      });

      expect(result).toContain('CREATE TABLE users');
      expect(result).toContain('id NUMBER(10) GENERATED BY DEFAULT AS IDENTITY NOT NULL');
      expect(result).toContain('name VARCHAR2(255)');
      expect(result).toContain('created_at TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL');
      expect(result).toContain('price NUMBER(10, 2) DEFAULT 0.00');
      expect(result).toContain("COMMENT ON TABLE users IS '用户表'");
      expect(result).toContain("COMMENT ON COLUMN users.name IS '名称'");
      expect(result).toContain('CREATE OR REPLACE PUBLIC SYNONYM users FOR users;');
    });

    it('should align Oracle columns in aligned mode', () => {
      const result = buildDDL({
        dbType: 'oracle',
        tableName: 'users',
        tableComment: '用户表',
        fields: sampleFields,
        indexes: [],
        sqlFormatMode: 'aligned',
      });

      expect(result).toContain('id          NUMBER(10) GENERATED BY DEFAULT AS IDENTITY NOT NULL');
      expect(result).toContain('price       NUMBER(10, 2) DEFAULT 0.00');
    });
  });

  describe('buildDDL for MariaDB', () => {
    it('should generate MariaDB DDL', () => {
      const result = buildDDL({
        dbType: 'mariadb',
        tableName: 'users',
        tableComment: '用户表',
        fields: sampleFields,
      });

      // MariaDB 应该生成与 MySQL 相同的 DDL
      expect(result).toContain('CREATE TABLE users');
      expect(result).toContain("COMMENT='用户表'");
      expect(result).toContain('id INT AUTO_INCREMENT NOT NULL');
      expect(result).toContain("name VARCHAR(255) NULL COMMENT '名称'");
      expect(result).toContain('created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
      expect(result).toContain("price DECIMAL(10, 2) NULL DEFAULT 0.00 COMMENT '价格'");
    });

    it('应该支持 ON UPDATE CURRENT_TIMESTAMP', () => {
      const fieldsWithUpdate: NormalizedField[] = [
        ...sampleFields,
        {
          name: 'updated_at',
          type: 'timestamp',
          comment: '更新时间',
          nullable: false,
          defaultKind: 'current_timestamp',
          defaultValue: '',
          onUpdate: 'current_timestamp',
        },
      ];

      const result = buildDDL({
        dbType: 'mariadb',
        tableName: 'users',
        tableComment: '用户表',
        fields: fieldsWithUpdate,
      });

      expect(result).toContain('ON UPDATE CURRENT_TIMESTAMP');
    });
  });

  describe('buildDDL with MySQL Partition', () => {
    it('should generate HASH partition DDL with column', () => {
      const partitionConfig = {
        enabled: true,
        type: 'HASH' as const,
        columns: ['id'],
        partitionCount: 4,
        partitions: [],
      };

      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'users',
        tableComment: '',
        fields: sampleFields,
        indexes: [],
        mysqlPartitionConfig: partitionConfig,
      });

      expect(result).toContain('PARTITION BY HASH(id)');
      expect(result).toContain('PARTITIONS 4');
    });

    it('should generate HASH partition DDL with expression', () => {
      const partitionConfig = {
        enabled: true,
        type: 'HASH' as const,
        columns: [],
        expression: 'YEAR(created_at)',
        partitionCount: 8,
        partitions: [],
      };

      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'orders',
        tableComment: '',
        fields: sampleFields,
        indexes: [],
        mysqlPartitionConfig: partitionConfig,
      });

      expect(result).toContain('PARTITION BY HASH(YEAR(created_at))');
      expect(result).toContain('PARTITIONS 8');
    });

    it('should generate KEY partition DDL', () => {
      const partitionConfig = {
        enabled: true,
        type: 'KEY' as const,
        columns: ['user_id'],
        partitionCount: 16,
        partitions: [],
      };

      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'orders',
        tableComment: '',
        fields: sampleFields,
        indexes: [],
        mysqlPartitionConfig: partitionConfig,
      });

      expect(result).toContain('PARTITION BY KEY(user_id)');
      expect(result).toContain('PARTITIONS 16');
    });

    it('should generate RANGE partition DDL with definitions', () => {
      const partitionConfig = {
        enabled: true,
        type: 'RANGE' as const,
        columns: ['created_at'],
        partitions: [
          { name: 'p2023', value: '2024' },
          { name: 'p2024', value: '2025' },
          { name: 'pmax', value: 'MAXVALUE' },
        ],
      };

      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'orders',
        tableComment: '',
        fields: sampleFields,
        indexes: [],
        mysqlPartitionConfig: partitionConfig,
      });

      expect(result).toContain('PARTITION BY RANGE(created_at)');
      expect(result).toContain('PARTITION p2023 VALUES LESS THAN (2024)');
      expect(result).toContain('PARTITION p2024 VALUES LESS THAN (2025)');
      expect(result).toContain('PARTITION pmax VALUES LESS THAN (MAXVALUE)');
    });

    it('should generate LIST partition DDL', () => {
      const partitionConfig = {
        enabled: true,
        type: 'LIST' as const,
        columns: ['status'],
        partitions: [
          { name: 'p_active', value: '1, 2' },
          { name: 'p_inactive', value: '0, -1' },
        ],
      };

      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'orders',
        tableComment: '',
        fields: sampleFields,
        indexes: [],
        mysqlPartitionConfig: partitionConfig,
      });

      expect(result).toContain('PARTITION BY LIST(status)');
      expect(result).toContain('PARTITION p_active VALUES IN (1, 2)');
      expect(result).toContain('PARTITION p_inactive VALUES IN (0, -1)');
    });

    it('should not generate partition clause when disabled', () => {
      const partitionConfig = {
        enabled: false,
        type: 'HASH' as const,
        columns: ['id'],
        partitionCount: 4,
        partitions: [],
      };

      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'users',
        tableComment: '',
        fields: sampleFields,
        indexes: [],
        mysqlPartitionConfig: partitionConfig,
      });

      expect(result).not.toContain('PARTITION BY');
    });

    it('should show comment when RANGE partition has no definitions', () => {
      const partitionConfig = {
        enabled: true,
        type: 'RANGE' as const,
        columns: ['id'],
        partitions: [],
      };

      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'orders',
        tableComment: '',
        fields: sampleFields,
        indexes: [],
        mysqlPartitionConfig: partitionConfig,
      });

      expect(result).toContain('-- 请添加分区定义');
    });

    it('should work with TiDB', () => {
      const partitionConfig = {
        enabled: true,
        type: 'HASH' as const,
        expression: 'dayofmonth(start_time)',
        columns: [],
        partitionCount: 32,
        partitions: [],
      };

      const result = buildDDL({
        dbType: 'tidb',
        tableName: 'events',
        tableComment: '',
        fields: sampleFields,
        indexes: [],
        mysqlPartitionConfig: partitionConfig,
      });

      expect(result).toContain('PARTITION BY HASH(dayofmonth(start_time))');
      expect(result).toContain('PARTITIONS 32');
    });

    it('should support RANGE COLUMNS partition type', () => {
      const partitionConfig = {
        enabled: true,
        type: 'RANGE COLUMNS' as const,
        columns: ['created_at'],
        partitions: [{ name: 'pmax', value: 'MAXVALUE' }],
      };

      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'orders',
        tableComment: '',
        fields: sampleFields,
        indexes: [],
        mysqlPartitionConfig: partitionConfig,
      });

      expect(result).toContain('PARTITION BY RANGE COLUMNS(created_at)');
      expect(result).toContain('PARTITION pmax VALUES LESS THAN (MAXVALUE)');
    });

    it('should ignore unsupported partition type', () => {
      const partitionConfig = {
        enabled: true,
        type: 'UNKNOWN' as any,
        columns: ['id'],
        partitions: [],
      };

      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'users',
        tableComment: '',
        fields: sampleFields,
        indexes: [],
        mysqlPartitionConfig: partitionConfig,
      });

      expect(result).not.toContain('PARTITION BY');
    });
  });

  describe('buildDDL with indexes and citus', () => {
    it('should create MySQL indexes with the table', () => {
      const indexes: IndexDefinition[] = [
        {
          id: 'idx-1',
          name: 'idx_users_name',
          fields: [{ name: 'name', direction: 'ASC' }],
          unique: true,
        },
      ];

      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'users',
        tableComment: '',
        fields: sampleFields,
        indexes,
      });

      expect(result.split(';')[0]).toContain('UNIQUE INDEX idx_users_name (name ASC)');
    });

    it('should create the MySQL primary key with the table', () => {
      const indexes: IndexDefinition[] = [
        {
          id: 'pk-1',
          name: 'pk_users',
          fields: [{ name: 'id', direction: 'ASC' }],
          unique: true,
          isPrimary: true,
        },
      ];

      const result = buildDDL({
        dbType: 'mysql',
        tableName: 'users',
        tableComment: '',
        fields: sampleFields,
        indexes,
      });

      expect(result.split(';')[0]).toContain('PRIMARY KEY (id ASC)');
    });

    it('should append citus reference table SQL', () => {
      const result = buildDDL({
        dbType: 'postgresql-citus',
        tableName: 'users',
        tableComment: '',
        fields: sampleFields,
        indexes: [],
        citusShardingConfig: {
          mode: 'reference',
        },
      });

      expect(result).toContain("SELECT create_reference_table('users');");
    });

    it('should append citus distributed table SQL', () => {
      const fieldsForCitus: NormalizedField[] = [
        ...sampleFields,
        {
          name: 'tenant_id',
          type: 'bigint',
          comment: '租户ID',
          nullable: false,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
      ];
      const result = buildDDL({
        dbType: 'postgresql-citus',
        tableName: 'users',
        tableComment: '',
        fields: fieldsForCitus,
        indexes: [],
        citusShardingConfig: {
          mode: 'distributed',
          distributionColumn: 'tenant_id',
        },
      });

      expect(result).toContain("SELECT create_distributed_table('users', 'tenant_id');");
    });

    it('should fallback when citus distributed mode has no distribution column', () => {
      const result = buildDDL({
        dbType: 'postgresql-citus',
        tableName: 'users',
        tableComment: '',
        fields: sampleFields,
        indexes: [],
        citusShardingConfig: {
          mode: 'distributed',
        },
      });

      expect(result).toContain('-- 请选择分片字段');
    });
  });

  describe('buildOracleSynonyms', () => {
    it('should generate PUBLIC synonym', () => {
      const result = buildOracleSynonyms('users');
      expect(result).toBe('CREATE OR REPLACE PUBLIC SYNONYM users FOR users;');
    });

    it('should handle qualified table names', () => {
      const result = buildOracleSynonyms('schema.users');
      expect(result).toBe('CREATE OR REPLACE PUBLIC SYNONYM schema.users FOR schema.users;');
    });

    it('should return empty string for invalid table name', () => {
      expect(buildOracleSynonyms('')).toBe('');
      expect(buildOracleSynonyms('   ')).toBe('');
    });
  });

  describe('buildDCL', () => {
    const authObjects = ['CBD_READ', 'CBD_RW', 'CBD_PROC'];

    it('should generate GRANT statements', () => {
      const result = buildDCL('users', authObjects);

      expect(result).toContain('GRANT SELECT ON users TO CBD_READ;');
      expect(result).toContain('GRANT SELECT ON users TO CBD_RW;');
      expect(result).toContain('GRANT SELECT ON users TO CBD_PROC;');
    });

    it('should handle empty authorization objects', () => {
      const result = buildDCL('users', []);
      expect(result).toBe('');
    });

    it('should handle invalid table name', () => {
      const result = buildDCL('', authObjects);
      expect(result).toBe('');
    });

    it('should filter empty authorization objects', () => {
      const result = buildDCL('users', ['CBD_READ', '', '  ', 'CBD_RW']);

      expect(result).toContain('GRANT SELECT ON users TO CBD_READ;');
      expect(result).toContain('GRANT SELECT ON users TO CBD_RW;');
      expect(result).not.toContain("GRANT SELECT ON users TO '';");
      expect(result).not.toContain("GRANT SELECT ON users TO '  ';");
    });
  });

  describe('Edge Cases', () => {
    it('should handle fields with special characters in comments', () => {
      const fieldsWithSpecialChars: NormalizedField[] = [
        {
          name: 'description',
          type: 'text',
          comment: "It's a test with 'quotes' and \\backslash\\",
          nullable: true,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
      ];

      const mysqlResult = buildDDL({
        dbType: 'mysql',
        tableName: 'test',
        tableComment: 'Test Table',
        fields: fieldsWithSpecialChars,
      });
      expect(mysqlResult).toContain("COMMENT 'It''s a test with ''quotes'' and \\backslash\\'");

      const pgResult = buildDDL({
        dbType: 'postgresql',
        tableName: 'test',
        tableComment: 'Test Table',
        fields: fieldsWithSpecialChars,
      });
      expect(pgResult).toContain("IS 'It''s a test with ''quotes'' and \\backslash\\'");
    });

    it('should handle very long table names and comments', () => {
      const longName = 'a'.repeat(100);
      const longComment = 'b'.repeat(500);

      const result = buildDDL({
        dbType: 'mysql',
        tableName: longName,
        tableComment: longComment,
        fields: sampleFields,
      });
      expect(result).toContain(`CREATE TABLE ${longName}`);
      expect(result).toContain(`COMMENT='${longComment}'`);
    });
  });
});
