---
title: "SQL to Prisma, TypeORM and other ORM models"
description: "Import MySQL table SQL and export Prisma, TypeORM, SQLAlchemy, GORM or JPA models. See input and output examples, type mappings and relationship limitations."
---

# SQL to Prisma, TypeORM and other ORM models

[Generate ORM models in DDLBuilder](https://ddl.xingkaixin.me/). Start with the [getting started guide](/en/basic/getting-started) or [import existing SQL](/en/advanced/import-and-parse) if you do not have a table yet. For cross-table references, check the [foreign keys and ER diagram](/en/advanced/foreign-key-and-er) first.

SQLite / D1 supports Drizzle output. Use the group export for cross-table foreign keys. See [query design and modeling](/en/advanced/modeling-workflows) for type mapping and initialization limits.

## Example: convert a MySQL users table to a Prisma model

This example generates a single-table model without cross-table relationships. Open [DDLBuilder](https://ddl.xingkaixin.me/), select MySQL, and [import this SQL](/en/advanced/import-and-parse):

```sql
CREATE TABLE users (
  id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  PRIMARY KEY (id ASC)
);
```

Select `users`, open the **ORM** tab in the generated output, and choose **Prisma**. The generated model is shown below. Alignment spacing may differ.

```prisma
model Users {
  id             Int        @id
  name           String
  @@map("users")
}
```

The primary key on `id` maps to `@id`, `name` becomes a required `String`, and `@@map("users")` preserves the database table name. There is no auto-increment or default value in this example, so inserts must provide both `id` and `name`.

This is a model fragment. Configure the MySQL datasource and client generator in your own Prisma project, validate the model, then generate the client or migrations according to your project's workflow. Model generation does not connect to or modify your database. For a users-and-orders relationship, continue with [foreign keys and ER diagrams](/en/advanced/foreign-key-and-er).

## When to use

Once the table structure is settled, generate ORM model classes and annotations instead of writing them by hand.

---

## Steps

### 1. Select the target framework
1. Click the **ORM** tab in the generated output.
2. In the **ORM Framework** selector, choose a framework:
   - **Prisma** (Node.js / TypeScript)
   - **TypeORM** (TypeScript / NestJS)
   - **SQLAlchemy** (Python / FastAPI)
   - **GORM** (Go / Gin / Fiber)
   - **JPA** (Java / Spring Boot)
3. The code area shows the model code for the selected framework and updates when you change the table.

### 2. Copy the code to your project
Click **Copy ORM Code**, then paste the code into an entity or model file in your project.

---

## Frameworks and type mappings

| Framework | Output format | Common annotations and constructs |
|---|---|---|
| **Prisma** | `.prisma` schema file | `@id`, `@default()`, `@map()`, `@@unique`, `@@index`, `@@map`, `@@schema` |
| **TypeORM** | TypeScript entity class | `@Entity()`, `@PrimaryGeneratedColumn()`, `@PrimaryColumn()`, `@Column({ type, precision })`, `@Index()` |
| **SQLAlchemy** | Python declarative class | `Column()`, `Integer`, `String()`, `Numeric()`, `Index()`, `__table_args__` |
| **GORM** | Go struct | `gorm:"column:xxx;primaryKey;autoIncrement;uniqueIndex"`, `TableName()` |
| **JPA** | Java entity class | `@Entity`, `@Table(name, schema)`, `@Id`, `@Column(name, nullable)` |

---

## Precision and schema namespaces

::: info Precision and namespaces
- TypeORM maps `bigint` to a `string` property. On MySQL-family and PostgreSQL-family databases, it also maps `decimal` and `numeric` to `string`, so the JavaScript `number` type does not lose precision.
- When Schema Name is set:
  - Prisma adds `@@schema("schemaName")` on PostgreSQL-family databases and SQL Server.
  - SQLAlchemy adds `{"schema": "schemaName"}` to `__table_args__`.
  - JPA adds `@Table(schema = "schemaName")`, or uses `catalog` on MySQL-family databases.
  - GORM's `TableName()` method returns the table name with the schema prefix.
:::

---

## Verification checklist

- [ ] Field names, type mappings, and primary keys in the ORM code match the table configuration.
- [ ] The pasted code passes type checks and compiles in your project.
- [ ] When Schema Name is set, the ORM code declares the namespace.
