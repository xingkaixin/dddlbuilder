# Advanced Guide Overview

Welcome to the DDLBuilder Advanced Guide. This section is designed for engineering leads, database architects, and power users tackling complex modeling, schema governance, workflow automation, and cross-team collaboration.

---

## Topic Directory

| Topic | Core Capabilities & Key Benefits | Guide Link |
|---|---|---|
| **Import & Parsing** | Reverse-engineer existing SQL, CSV, Excel, or JSON Schema into editable structures | [Import and Parse SQL](/en/advanced/import-and-parse) |
| **WebMCP Agent Integration** | Connect browser-based AI agents to safely inspect, lint, and patch active schemas | [WebMCP Agent Workflow](/en/advanced/webmcp) |
| **AI-Assisted Modeling** | Conversational table generation, step-by-step patch reviews, and smart comments | [AI-Assisted Table Design Workflow](/en/advanced/ai-workflow) |
| **SQL Review & Explanation** | Architectural quality audits, risk detection, actionable tips, and SQL explanations | [Review and Explain SQL](/en/advanced/review-and-explain) |
| **Partitioning & Sharding** | Multi-strategy MySQL/TiDB partitioning and PostgreSQL Citus distributed tables | [Partitioning and Sharding](/en/advanced/partition-and-sharding) |
| **Diff & Rollback** | Visual schema diffing, forward ALTER migration scripts, and rollback DDL | [Change Diff and Rollback](/en/advanced/diff-and-rollback) |
| **Relational Modeling & ER** | Visual canvas connections, cardinality wizards, cascade rules, and schema topology | [Foreign Key Configuration and ER Diagram](/en/advanced/foreign-key-and-er) |
| **ORM Generation** | One-click code generation for Prisma, TypeORM, SQLAlchemy, GORM, and JPA | [ORM Model Generation](/en/advanced/orm-generation) |
| **Advanced Database Objects** | `CREATE VIEW` statements and skeleton code for procedures, functions, and triggers | [View and Routine Configuration](/en/advanced/view-and-routine) |
| **Schema Governance & Linting** | Built-in linter detecting naming violations, type hazards, and redundant indexes | [Schema Lint](/en/advanced/schema-lint) |
| **Testing & Metadata** | Realistic mock test data generation and visual color-badged logical enums | [Mock Data and Logical Enums](/en/advanced/mock-data-and-enum) |
| **Domain Blueprints** | Production-grade business templates (User, Order, Audit Log, etc.) | [Table Blueprint Templates](/en/advanced/blueprint-templates) |

---

## Recommended Learning Paths

- **Legacy Migration**: Start with [Import and Parse SQL](/en/advanced/import-and-parse) to bring existing DDL into your workspace.
- **Data Architecture**: Combine [Foreign Key Configuration and ER Diagram](/en/advanced/foreign-key-and-er) with [Table Blueprint Templates](/en/advanced/blueprint-templates) to build cohesive domain models.
- **Quality Assurance**: Run [Schema Lint](/en/advanced/schema-lint) and [Review and Explain SQL](/en/advanced/review-and-explain) prior to production rollout.
- **Change Management**: Leverage [Change Diff and Rollback](/en/advanced/diff-and-rollback) to prepare rollout and contingency scripts.
