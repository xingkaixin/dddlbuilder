---
title: "Online SQL to ER Diagram & SQL to Prisma Schema Converter"
description: "Import MySQL or PostgreSQL CREATE TABLE SQL to inspect interactive ER diagrams and export Prisma Schema, TypeORM, SQLAlchemy, GORM, and JPA models locally in your browser."
preset: "sql-to-er-prisma"
faq:
  - question: "Which ORM frameworks are supported besides Prisma?"
    answer: "DDLBuilder exports Prisma, TypeORM, SQLAlchemy, GORM, and JPA models, plus Drizzle output when using the SQLite / D1 dialect."
  - question: "Can I draw ER relationships if my SQL has no physical foreign keys?"
    answer: "Yes. Drag between columns in the ER diagram and choose Logical Relationship to document cardinality and business notes with dashed lines without modifying your DDL."
  - question: "Does DDLBuilder connect to my database or execute imported SQL?"
    answer: "No. DDLBuilder parses DDL text for schema design only; it never asks for database credentials or executes SQL."
---

# Online SQL to ER Diagram & SQL to Prisma Schema Converter

DDLBuilder parses existing `CREATE TABLE` SQL into editable table schemas, renders interactive ER diagrams with physical foreign keys or logical relationships, and exports Prisma Schema, TypeORM, SQLAlchemy, GORM, and JPA model code—all without signing in or connecting to a live database.

## Verified Example: MySQL Table to Prisma Schema

Opening this page's preset loads the following `orders` schema into a new draft and opens the **ORM (Prisma)** output tab directly:

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

Generated Prisma Schema output:

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

## Workflow: SQL to ER Diagram & ORM Code

1. **Import or open a table**: Launch the preset from this page, or click **Import** in DDLBuilder to paste and save multiple `CREATE TABLE` statements.
2. **Inspect & edit the ER diagram**: Open **ER Diagram** in the top bar to view all saved tables and drag between columns to add physical foreign keys (solid lines) or logical relationships (dashed lines).
3. **Export Prisma or other ORM models**: Switch the output panel to **ORM**, choose **Prisma** (or TypeORM, SQLAlchemy, GORM, JPA), and copy the generated model code.
4. **Deliver documentation**: Export Markdown or searchable offline HTML data dictionaries from **Tools**.

## FAQ

### Which ORM frameworks are supported besides Prisma?

DDLBuilder exports **Prisma**, **TypeORM**, **SQLAlchemy**, **GORM**, and **JPA** models, plus **Drizzle** output when using the SQLite / D1 dialect.

### Can I draw ER relationships if my SQL has no physical foreign keys?

Yes. Drag between columns in the ER diagram and choose **Logical Relationship** to document cardinality and business notes with dashed lines without modifying your DDL.

### Does DDLBuilder connect to my database or execute imported SQL?

No. DDLBuilder parses DDL text for schema design only; it never asks for database credentials or executes SQL.

## Related Guides

- [Foreign key configuration and ER diagram](/en/advanced/foreign-key-and-er)
- [ORM model generation](/en/advanced/orm-generation)
- [Import and parse SQL](/en/advanced/import-and-parse)
- [Database tools](/en/advanced/database-tools)
