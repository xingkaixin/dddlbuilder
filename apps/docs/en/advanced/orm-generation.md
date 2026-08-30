# ORM Model Generation

This guide details how to export schema designs directly into strongly typed model classes across industry-standard ORM frameworks.

## Overview

Bridge database modeling and backend engineering by generating clean, typed, and annotated model code without manual transcription errors.

---

## Operations Walkthrough

### 1. Select Target Framework
1. Switch to the **ORM** tab in the right-hand output panel.
2. Select your framework from the dropdown:
   - **Prisma** (Node.js / TypeScript)
   - **TypeORM** (TypeScript / NestJS)
   - **SQLAlchemy** (Python / FastAPI / Django)
   - **GORM** (Go / Gin / Fiber)
   - **JPA / Hibernate** (Java / Spring Boot)
3. The editor immediately renders framework-compliant entity definitions.

### 2. Copy Code to Your Project
Click **Copy ORM** to copy the generated class or schema to your clipboard, then paste it directly into your application codebase.

---

## Frameworks and Type Mapping Specifications

| Framework | Output Format | Common Annotations and Constructs |
|---|---|---|
| **Prisma** | `.prisma` schema file | `@id`, `@default()`, `@map()`, `@unique`, `@@index`, `@@schema` |
| **TypeORM** | TypeScript Entity class | `@Entity()`, `@PrimaryGeneratedColumn()`, `@Column({ type, precision })`, `@Index()` |
| **SQLAlchemy** | Python Declarative class | `Column()`, `Integer()`, `String()`, `DECIMAL()`, `__table_args__` |
| **GORM** | Go Struct | `gorm.Model`, `gorm:"column:xxx;type:xxx;primaryKey;uniqueIndex"` |
| **JPA** | Java Entity class | `@Entity`, `@Table(name, schema)`, `@Id`, `@Column(name, nullable)`, `@Index` |

---

## Precision Safety & Schema Namespace Details

::: info Type Safety and Namespaces
- **High-Precision Decimals & BigInt**: In TypeORM outputs, `bigint` and `decimal/numeric` types are mapped to `string` properties to prevent JavaScript float precision truncation.
- **Schema Namespaces**:
  - **Prisma**: Appends `@@schema("schemaName")` for PostgreSQL and SQL Server.
  - **SQLAlchemy**: Declares `schema='schemaName'` in `__table_args__`.
  - **JPA**: Binds `schema = "schemaName"` within `@Table`.
  - **GORM**: Implements a custom `TableName()` method returning the qualified table name.
:::

---

## Verification Checklist

- [ ] Generated ORM fields, primary keys, and column attributes match table configurations.
- [ ] Pasted model files compile and pass static type checks cleanly.
- [ ] Schema namespaces are appropriately declared in framework-specific configurations.
