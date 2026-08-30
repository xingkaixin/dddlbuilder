# DDLBuilder Documentation

Welcome to the official documentation for **DDLBuilder**. This guide will help you understand the core capabilities of the platform and efficiently design, review, and export database schemas.

## Quick Navigation

### Basic Guide
- [Quick Start](/en/basic/getting-started) — Get started quickly and generate your first DDL in minutes
- [Core Concepts](/en/basic/core-concepts) — Understand workspaces, drafts, saved tables, permissions, and sync mechanics
- [Table and Field Configuration](/en/basic/table-and-fields) — Configure field types, constraints, logical enums, and estimate storage
- [Indexes, Privileges, and Misc](/en/basic/index-auth-misc) — Set up primary keys, indexes, AI index advisor, DCL privileges, and engine options
- [DDL Output and Sharing](/en/basic/ddl-and-share) — Copy multi-dialect SQL, generate ORM models, and create read-only share links
- [Saved Tables and Drafts](/en/basic/saved-tables) — Manage multiple drafts, folder hierarchies, the trash bin, and cloud synchronization

### Advanced Guide
- [Advanced Guide Overview](/en/advanced/) — Explore advanced modeling, tooling, and engineering features
- [Import and Parse SQL](/en/advanced/import-and-parse) — Parse existing SQL DDL or import from CSV, Excel, and JSON Schema files
- [WebMCP Agent Workflow](/en/advanced/webmcp) — Enable AI agents to inspect, lint, and safely patch schemas in your browser
- [AI-Assisted Table Design Workflow](/en/advanced/ai-workflow) — Conversational table design, patch reviews, and smart comment generation
- [Review and Explain SQL](/en/advanced/review-and-explain) — Architectural quality scoring, optimization suggestions, and SQL explanations
- [Partitioning and Sharding](/en/advanced/partition-and-sharding) — MySQL/TiDB partitioning and PostgreSQL Citus distributed tables
- [Change Diff and Rollback](/en/advanced/diff-and-rollback) — Compare schema versions, generate ALTER scripts, and create rollback DDL
- [Foreign Key Configuration and ER Diagram](/en/advanced/foreign-key-and-er) — Visual canvas modeling, relationship wizards, and constraint topology
- [ORM Model Generation](/en/advanced/orm-generation) — Export code for Prisma, TypeORM, SQLAlchemy, GORM, and JPA
- [View and Routine Configuration](/en/advanced/view-and-routine) — Generate view definitions and skeleton code for procedures, functions, and triggers
- [Schema Lint](/en/advanced/schema-lint) — Automatically scan for naming conventions, data type risks, and redundant indexes
- [Mock Data and Logical Enums](/en/advanced/mock-data-and-enum) — Generate realistic test data and define visual enum rules
- [Table Blueprint Templates](/en/advanced/blueprint-templates) — Apply industry-standard business templates (User, Order, Log, etc.) in seconds

### FAQ & Changelog
- [Errors and Failure Handling](/en/faq/common-errors) — Troubleshooting import errors, copy failures, expired shares, and sync issues
- [Feature Entry and Visibility](/en/faq/feature-visibility) — Locate dialect-specific tabs, hidden panels, and feature entries
- [Sharing and Collaboration](/en/faq/sharing-and-collaboration) — Read-only collaboration, branching editable copies, and version management
- [Release Notes](/en/changelog/changelog) — Track feature releases and product evolution

## Key Features

- **Broad Multi-Dialect Support**: Accurately generates DDL and DCL for MySQL, PostgreSQL, SQL Server, Oracle, TiDB, MariaDB, OceanBase, Dameng, GaussDB, Kingbase, GBase, PolarDB, and more.
- **Modern Visual Modeling**: Multi-tab parallel editing, column freezing, compact layout, drag-and-drop column reordering, and interactive ER diagrams.
- **Cross-Device Sync & Multi-Language**: Built on CRDT (Yjs) technology for reliable multi-tab state management, incremental cloud sync, and full support for Chinese, English, and Japanese.
- **Deep AI Integration**: Built-in AI table design workshop, patch review workflow, AI index advisor, architectural DDL reviews, and automated comments.
- **Engineering-Ready Tooling**: Direct export to popular ORMs, mock data generation, reverse SQL parsing, and automated schema linting.
