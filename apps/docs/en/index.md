---
title: "Database design, SQL to ER diagrams and DDL guides"
description: "Design MySQL, PostgreSQL and SQLite schemas with DDLBuilder. Find guides for SQL to ER diagrams, SQL to Prisma, schema comparison, data dictionaries and CSV to INSERT SQL."
---

# Database design, SQL to ER diagrams and DDL guides

DDLBuilder is an online database schema designer and DDL generator. Configure columns and indexes, import existing SQL to view ER diagrams, or export ORM models. Choose a guide for the task you need to complete.

[Open DDLBuilder and design a database](https://ddl.xingkaixin.me/)

## Choose a guide by task

| Task | Workflow and output |
| --- | --- |
| [Generate MySQL or PostgreSQL CREATE TABLE SQL](/en/basic/getting-started) | Configure columns, primary keys and indexes, then copy DDL |
| [Convert SQL to an ER diagram](/en/advanced/foreign-key-and-er) | Import and save tables, add foreign keys or logical relationships, and inspect the diagram |
| [Convert SQL to Prisma and other ORM models](/en/advanced/orm-generation) | Export Prisma, TypeORM, SQLAlchemy, GORM or JPA code |
| [Compare two SQL schemas](/en/advanced/database-tools#compare-two-sql-snapshots) | Inspect MySQL or PostgreSQL schema changes and export migration SQL |
| [Generate a data dictionary from SQL](/en/advanced/database-tools#data-dictionary) | Export Markdown or searchable offline HTML documentation |
| [Convert CSV or Excel to INSERT SQL](/en/advanced/business-data-import) | Map fields, validate records and export SQL with an error report |
| [Design SQL queries and business tables](/en/advanced/modeling-workflows) | Generate SELECT queries from relationships, business modules and SQLite/D1 starter projects |

Start manual design, SQL import and local exports without signing in. See [getting started](/en/basic/getting-started) for cloud sync and AI account requirements. The tool generates SQL; it does not connect to your database to execute it.

## Quick navigation

### Basic guide
- [Quick start](/en/basic/getting-started): configure your first table and generate DDL
- [Core concepts](/en/basic/core-concepts): workspace, draft box, saved tables, read-only sharing, and cloud sync
- [Table and field configuration](/en/basic/table-and-fields): field types, constraints, logical enums, and size estimates
- [Indexes, privileges, and misc](/en/basic/index-auth-misc): primary keys and indexes, AI Index Advisor, privilege DCL, and storage options
- [DDL output and sharing](/en/basic/ddl-and-share): copy SQL, generate ORM models, and create read-only share links
- [Saved tables and drafts](/en/basic/saved-tables): drafts, folders, trash, and multi-device sync

### Advanced guide
- [Advanced guide overview](/en/advanced/): list of advanced topics
- [Import and parse SQL](/en/advanced/import-and-parse): parse existing DDL, or import table structures from CSV, Excel, or JSON Schema
- [WebMCP agent workflow](/en/advanced/webmcp): a browser AI agent reads and checks your schema, and changes need your confirmation
- [AI-assisted table design workflow](/en/advanced/ai-workflow): generate a table from a description, review AI edits one by one, and fill in field comments
- [Review and explain SQL](/en/advanced/review-and-explain): DDL scores and suggested changes, and explanations of SQL snippets
- [Partitioning and sharding](/en/advanced/partition-and-sharding): MySQL/TiDB partitioning and PostgreSQL Citus sharding
- [Change diff and rollback](/en/advanced/diff-and-rollback): compare schema changes, then generate ALTER scripts and rollback DDL
- [Foreign key configuration and ER diagram](/en/advanced/foreign-key-and-er): create foreign keys or logical relationships in the ER diagram and see how tables relate
- [ORM model generation](/en/advanced/orm-generation): export Prisma, TypeORM, SQLAlchemy, GORM, and JPA models
- [View and routine configuration](/en/advanced/view-and-routine): view DDL and skeleton code for procedures, functions, and triggers
- [Schema lint](/en/advanced/schema-lint): check naming, primary keys, field types, and index issues
- [Mock data and logical enums](/en/advanced/mock-data-and-enum): generate test data and define enum values for fields
- [Table blueprint templates](/en/advanced/blueprint-templates): save a whole table as a blueprint and reuse it in a new draft

### FAQ and changelog
- [Errors and failure handling](/en/faq/common-errors): import failures, copy failures, expired share links, and sync problems
- [Feature entry and visibility](/en/faq/feature-visibility): why some tabs or buttons do not appear
- [Sharing and collaboration](/en/faq/sharing-and-collaboration): read-only sharing, saving a copy, and how the draft box differs from saved tables
- [Release notes](/en/changelog/changelog): changes in each release

## Main features

- 16 database types: MySQL, MariaDB, TiDB, PolarDB, OceanBase (MySQL and Oracle modes), PostgreSQL, PostgreSQL (Citus), GaussDB, Kingbase, GBase, SQL Server, Oracle, Dameng, SQLite / D1, and Hive. DDL and DCL follow the selected database.
- Drag fields to reorder them and freeze the leading columns. Edit different tables in separate tabs. Draw lines in the ER diagram to create table relationships.
- After you sign in, the workspace syncs incrementally across devices through Yjs (CRDT). The interface is available in Chinese, English, and Japanese.
- AI features include AI Table Workshop, AI Edit, AI Index Advisor, AI Review, and AI Comments.
- Generate Prisma, TypeORM, SQLAlchemy, GORM, and JPA model code and mock test data, import table structures from SQL, and run schema lint.
