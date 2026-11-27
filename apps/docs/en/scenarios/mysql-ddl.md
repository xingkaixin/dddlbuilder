---
title: "MySQL Online DDL Generator (Partitions & Indexes)"
description: "Visually design MySQL CREATE TABLE statements in your browser with primary keys, unique indexes, composite indexes, InnoDB charset options, and RANGE COLUMNS partitions."
preset: "mysql-partition"
faq:
  - question: "What is required for primary and unique keys on a MySQL partitioned table?"
    answer: "In MySQL, every primary key and unique index must include all columns used in the partitioning expression. The preset orders table already includes created_at in both the primary key and unique index."
  - question: "Do I need to sign in or connect a database to generate MySQL DDL?"
    answer: "No. Schema design, index setup, partition generation, and SQL export run locally in your browser without signing in or connecting to your database."
  - question: "Which MySQL-compatible dialects are supported?"
    answer: "DDLBuilder supports MySQL, MariaDB, TiDB, PolarDB, OceanBase (MySQL mode), and GBase with dialect-specific DDL and partitioning syntax."
---

# MySQL Online DDL Generator (Partitions & Indexes)

DDLBuilder lets you visually configure MySQL columns, primary keys, unique and composite indexes, `InnoDB` table options, and `RANGE COLUMNS` / `LIST` / `HASH` partitions in your browser, producing review-ready `CREATE TABLE` SQL locally without signing in or connecting to your database.

## Verified DDL Example: Monthly Partitioned Orders Table

Use the example button at the top or bottom of this page to open this MySQL partitioned `orders` schema in a new draft tab. Edit columns, indexes, or partition ranges and copy the updated SQL immediately:

```sql
CREATE TABLE orders (
  id BIGINT AUTO_INCREMENT NOT NULL COMMENT '订单主键ID',
  order_no VARCHAR(32) NOT NULL COMMENT '订单编号',
  user_id BIGINT NOT NULL COMMENT '下单用户ID',
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00 COMMENT '订单总金额',
  status TINYINT(1) NOT NULL DEFAULT 0 COMMENT '订单状态：0-待支付，1-已支付，2-已取消',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（分区键）',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id ASC, created_at ASC),
  UNIQUE INDEX uk_orders_order_no_created (order_no ASC, created_at ASC),
  INDEX idx_orders_user_created (user_id ASC, created_at DESC)
) COMMENT='订单主表（按月分区）' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
PARTITION BY RANGE COLUMNS(created_at) (
  PARTITION p202601 VALUES LESS THAN ('2026-02-01'),
  PARTITION p202602 VALUES LESS THAN ('2026-03-01'),
  PARTITION p202603 VALUES LESS THAN ('2026-04-01'),
  PARTITION pmax VALUES LESS THAN (MAXVALUE)
);
```

## Key Capabilities

- **Columns & constraints**: Configure `BIGINT`, `DECIMAL`, `DATETIME`, `AUTO_INCREMENT`, `NOT NULL`, default values, `ON UPDATE CURRENT_TIMESTAMP`, and column comments.
- **Primary & composite indexes**: Define primary, unique, and multi-column indexes with explicit `ASC` / `DESC` ordering.
- **Partition builder**: Configure `RANGE`, `RANGE COLUMNS`, `LIST`, `LIST COLUMNS`, `HASH`, or `KEY` partitions, including quick yearly/monthly/daily range generation.
- **Table options**: Set storage engine (`InnoDB`), character set (`utf8mb4`), and collation (`utf8mb4_0900_ai_ci`).
- **Linting & ALTER scripts**: Run built-in Schema Lint checks and generate `ALTER TABLE` plus rollback DDL when editing saved tables.

## Steps

1. Click the example button to load `mysql-partition` in DDLBuilder, or create a blank draft and select **MySQL**.
2. Adjust column names, data types, defaults, and comments in the **Fields** tab.
3. Refine primary, unique, and query indexes in the **Indexes** tab.
4. Open **Advanced → Partitioning** and **Table options** to adjust partition ranges and engine/charset settings.
5. Copy the generated `CREATE TABLE` SQL, or switch to the **ORM** tab for Prisma, GORM, or JPA output.

## FAQ

### What is required for primary and unique keys on a MySQL partitioned table?

In MySQL, every primary key and unique index must include all columns used in the partitioning expression. The preset `orders` table already includes `created_at` in both the primary key and unique index.

### Do I need to sign in or connect a database to generate MySQL DDL?

No. Schema design, index setup, partition generation, and SQL export run locally in your browser without signing in or connecting to your database.

### Which MySQL-compatible dialects are supported?

DDLBuilder supports MySQL, MariaDB, TiDB, PolarDB, OceanBase (MySQL mode), and GBase with dialect-specific DDL and partitioning syntax.

## Related Guides

- [Partitioning and sharding](/en/advanced/partition-and-sharding)
- [Indexes, privileges, and misc](/en/basic/index-auth-misc)
- [Change diff and rollback](/en/advanced/diff-and-rollback)
- [Schema Lint](/en/advanced/schema-lint)
