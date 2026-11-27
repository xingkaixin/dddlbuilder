---
title: "MySQL 在线建表 DDL 生成器（支持分区表与索引）"
description: "在浏览器中可视化设计 MySQL 建表语句，配置主键、唯一索引、复合索引、InnoDB 字符集与 RANGE COLUMNS 分区表，一键加载订单分区表示例并复制 CREATE TABLE SQL。"
preset: "mysql-partition"
faq:
  - question: "MySQL 分区表的主键和唯一索引有什么硬性限制？"
    answer: "在 MySQL 中，所有主键和唯一索引的字段集合都必须包含分区键，否则建表执行会报错。筑表师预设的 orders 分区表示例已将 created_at 纳入主键和唯一索引。"
  - question: "生成 MySQL DDL 需要登录或连接数据库吗？"
    answer: "不需要。表结构设计、索引配置、分区生成和复制 SQL 全部在浏览器本地完成，无需登录，也不会连接你的数据库执行语句。"
  - question: "支持哪些 MySQL 系数据库方言？"
    answer: "筑表师支持 MySQL、MariaDB、TiDB、PolarDB、OceanBase（MySQL 模式）和 GBase，并按所选方言输出对应的建表与分区语法。"
---

# MySQL 在线建表 DDL 生成器（支持分区表与索引）

筑表师（DDLBuilder）支持在浏览器中可视化配置 MySQL 字段、主键、唯一索引、复合索引、`InnoDB` 表选项与 `RANGE COLUMNS` / `LIST` / `HASH` 分区定义，实时输出可直接审阅和复制的 `CREATE TABLE` DDL。全流程本地计算，无需登录，也不连接用户数据库。

## 真实 DDL 输出示例：按月分区的订单表

点击本页顶部或底部的示例按钮，会直接在编辑器新草稿中打开以下 MySQL 分区订单表结构。你可以修改字段、增减分区或切换方言，右侧 DDL 实时同步更新：

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

## 核心能力

- **字段与约束配置**：配置 `BIGINT`、`DECIMAL`、`DATETIME`、自增、`NOT NULL`、`DEFAULT`、`ON UPDATE CURRENT_TIMESTAMP` 与字段注释。
- **主键与复合索引**：在索引面板勾选字段顺序和升降序（`ASC` / `DESC`），快速定义主键、唯一索引与普通复合索引。
- **分区配置**：支持 `RANGE`、`RANGE COLUMNS`、`LIST`、`LIST COLUMNS`、`HASH`、`KEY`，并可按年、按月、按日快捷生成时间分区。
- **表级选项**：可视化设置存储引擎（`InnoDB`）、字符集（`utf8mb4`）与排序规则（`utf8mb4_0900_ai_ci`）。
- **规范检查与变更脚本**：内置 Schema Lint 检查命名和冗余索引；保存表后继续修改时，可自动生成 `ALTER TABLE` 与回滚 DDL。

## 操作步骤

1. 点击本页按钮以 `mysql-partition` 示例打开筑表师，或直接创建空白草稿并选择数据库类型为 **MySQL**。
2. 在 **字段配置** 表格中调整列名、数据类型、默认值和注释。
3. 切换到 **索引配置** 调整主键与业务查询索引。
4. 在 **高级设置 → 分区配置** 与 **表级选项** 中调整分区边界和引擎字符集。
5. 在输出区复制生成的 `CREATE TABLE` SQL，或切换到 **ORM 模型** 导出 Prisma / GORM / JPA 代码。

## 常见问题

### MySQL 分区表的主键和唯一索引有什么硬性限制？

在 MySQL 中，所有主键和唯一索引的字段集合都必须包含分区键，否则建表执行会报错。筑表师预设的 `orders` 分区表示例已将 `created_at` 纳入主键和唯一索引。

### 生成 MySQL DDL 需要登录或连接数据库吗？

不需要。表结构设计、索引配置、分区生成和复制 SQL 全部在浏览器本地完成，无需登录，也不会连接你的数据库执行语句。

### 支持哪些 MySQL 系数据库方言？

筑表师支持 MySQL、MariaDB、TiDB、PolarDB、OceanBase（MySQL 模式）和 GBase，并按所选方言输出对应的建表与分区语法。

## 相关指南

- [分区与分片配置](/zh/advanced/partition-and-sharding)
- [索引、授权与杂项](/zh/basic/index-auth-misc)
- [变更对比与回滚](/zh/advanced/diff-and-rollback)
- [Schema 规范检查](/zh/advanced/schema-lint)
