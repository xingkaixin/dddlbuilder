---
title: "SQL 转 ER 图在线工具 / SQL 转 Prisma Schema"
description: "导入 MySQL、PostgreSQL 等建表 SQL 在线生成可视化 ER 关系图，并一键导出 Prisma Schema、TypeORM、SQLAlchemy、GORM 与 JPA 模型代码，无需登录即可本地导出。"
preset: "sql-to-er-prisma"
faq:
  - question: "除了 Prisma Schema，还支持哪些 ORM 框架？"
    answer: "支持 Prisma、TypeORM、SQLAlchemy、GORM 和 JPA；选择 SQLite / D1 方言时提供 Drizzle 输出。"
  - question: "SQL 中没有写物理外键，也能在 ER 图中连线吗？"
    answer: "可以。在 ER 关系图中拖线时可选择创建物理外键或逻辑关系；逻辑关系以虚线展示业务关联，不会修改 DDL 或添加物理约束。"
  - question: "导入的 SQL 会被执行或连接我的数据库吗？"
    answer: "不会。筑表师只解析 SQL 文本中的表结构定义，不接收数据库凭据，也不会连接任何数据库。"
---

# SQL 转 ER 图在线工具 / SQL 转 Prisma Schema

筑表师（DDLBuilder）可以将已有 `CREATE TABLE` SQL 导入为可编辑的表结构，在可视化 ER 关系图中查看和拖拽建立物理外键或逻辑关系，并同步导出 Prisma Schema、TypeORM、SQLAlchemy、GORM 与 JPA 模型代码。不登录即可完成导入、可视化查看与代码复制。

## 真实输出示例：MySQL 订单表转 Prisma Schema

点击本页示例按钮会在筑表师中打开以下订单表，并直接定位到 **ORM 模型（Prisma）** 输出页：

```sql
CREATE TABLE orders (
  id BIGINT AUTO_INCREMENT NOT NULL COMMENT '订单主键ID',
  user_id BIGINT NOT NULL COMMENT '关联用户ID',
  order_no VARCHAR(32) NOT NULL COMMENT '订单号',
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 COMMENT '订单金额',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '状态',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id ASC),
  UNIQUE INDEX uk_orders_order_no (order_no ASC),
  INDEX idx_orders_user_id (user_id ASC)
) COMMENT='电商订单表';
```

对应的 Prisma Schema 输出如下：

```prisma
/// 电商订单表
model Orders {
  /// 订单主键ID
  id             BigInt     @id @default(autoincrement())
  /// 关联用户ID
  userId         BigInt     @map("user_id")
  /// 订单号
  orderNo        String     @map("order_no")
  /// 订单金额
  totalAmount    Decimal    @default(0.00) @map("total_amount")
  /// 状态
  status         String     @default("pending")
  /// 创建时间
  createdAt      DateTime   @default(now()) @map("created_at")
  @@index([userId])
  @@unique([orderNo])
  @@map("orders")
}
```

## SQL 转 ER 图与 ORM 导出流程

1. **导入或打开表结构**：点击本页按钮加载示例表，或在筑表师中点击 **导入结构**，粘贴多张表的 `CREATE TABLE` SQL 批量导入并保存。
2. **查看与编辑 ER 关系图**：点击顶部 **关系图**，自动布局展示工作区内所有已保存表；从源字段拖向目标字段即可通过向导创建物理外键（实线）或逻辑关系（虚线）。
3. **导出 Prisma / ORM 代码**：在表编辑器的输出区切换至 **ORM 模型**，选择 **Prisma**（或 TypeORM / SQLAlchemy / GORM / JPA），点击复制直接粘贴进项目工程。
4. **补充交付物**：在 **工具** 中还可以为多张表生成 Markdown / 离线 HTML 数据字典，或导出只读分享链接。

## 常见问题

### 除了 Prisma Schema，还支持哪些 ORM 框架？

支持 **Prisma**、**TypeORM**、**SQLAlchemy**、**GORM** 和 **JPA**；选择 SQLite / D1 方言时提供 **Drizzle** 输出。

### SQL 中没有写物理外键，也能在 ER 图中连线吗？

可以。在 ER 关系图中拖线时可选择创建 **物理外键** 或 **逻辑关系**；逻辑关系以虚线展示业务关联，不会修改 DDL 或添加物理约束。

### 导入的 SQL 会被执行或连接我的数据库吗？

不会。筑表师只解析 SQL 文本中的表结构定义，不接收数据库凭据，也不会连接任何数据库。

## 相关指南

- [外键配置与 ER 图](/zh/advanced/foreign-key-and-er)
- [ORM 模型生成](/zh/advanced/orm-generation)
- [导入与解析 SQL](/zh/advanced/import-and-parse)
- [数据库交付工具](/zh/advanced/database-tools)
