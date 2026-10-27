# Advanced guide overview

This section covers DDLBuilder's advanced features by topic. The table below lists what each topic covers and links to its page.

---

## Topic directory

| Topic | What it covers | Page |
|---|---|---|
| Database delivery tools | Multi-table dictionaries, SQL snapshot comparison, and related test rows | [Database Tools](/en/advanced/database-tools) |
| Import and parsing | Parse existing SQL, and import table structures from CSV, Excel, or JSON Schema | [Import and Parse SQL](/en/advanced/import-and-parse) |
| WebMCP agent workflow | Browser-based AI agents read, check, and edit tables through WebMCP | [WebMCP Agent Workflow](/en/advanced/webmcp) |
| AI-assisted table design | Conversational table generation, AI-proposed table edits that you accept one by one, and AI comment filling | [AI-Assisted Table Design Workflow](/en/advanced/ai-workflow) |
| SQL review and explanation | DDL scoring, risk checks, improvement suggestions, and explanations of selected SQL | [Review and Explain SQL](/en/advanced/review-and-explain) |
| Partitioning and sharding | MySQL/TiDB partitioning and PostgreSQL Citus sharding | [Partitioning and Sharding](/en/advanced/partition-and-sharding) |
| Diff and rollback | Schema diff, forward ALTER scripts, and rollback DDL | [Change Diff and Rollback](/en/advanced/diff-and-rollback) |
| Relational modeling and ER | Model physical foreign keys and logical relationships with cardinality, optionality, and business descriptions | [Foreign Key Configuration and ER Diagram](/en/advanced/foreign-key-and-er) |
| Field standards and business dictionary | Define standard fields, link business concepts, check saved tables for deviations, and import or export the library | [Field Standards and Business Dictionary](/en/advanced/field-standards) |
| ORM generation | Export Prisma, TypeORM, SQLAlchemy, GORM, and JPA models | [ORM Model Generation](/en/advanced/orm-generation) |
| Views and routines | View DDL (`CREATE VIEW`) and skeleton code for procedures, functions, and triggers | [View and Routine Configuration](/en/advanced/view-and-routine) |
| Schema lint | Check naming, primary keys, column types, indexes, and audit columns | [Schema Lint](/en/advanced/schema-lint) |
| Mock data and logical enums | Generate batches of mock test data, and configure logical enums with color badges | [Mock Data and Logical Enums](/en/advanced/mock-data-and-enum) |
| Table blueprints | Save a table as a table blueprint, then reuse its fields, indexes, and table-level settings in a new draft | [Table Blueprint Templates](/en/advanced/blueprint-templates) |

---

## Reading by task

- To migrate an existing database, start with [Import and Parse SQL](/en/advanced/import-and-parse) to parse existing DDL into editable tables.
- To design several related tables, combine [Foreign Key Configuration and ER Diagram](/en/advanced/foreign-key-and-er) with [Table Blueprint Templates](/en/advanced/blueprint-templates).
- Before release, check table structures with [Schema Lint](/en/advanced/schema-lint) and [Review and Explain SQL](/en/advanced/review-and-explain).
- Before deployment, use [Change Diff and Rollback](/en/advanced/diff-and-rollback) to generate release and rollback scripts.
