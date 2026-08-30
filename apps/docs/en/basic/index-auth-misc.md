# Indexes, Privileges, and Misc

This guide explains how to design high-performance indexing strategies, configure access privileges (DCL), fine-tune storage engine options, and generate routine skeleton code.

## Overview

Once basic columns are configured, define indexing strategies for query optimization, declare access control grants, and set physical storage parameters to prepare schemas for production deployment.

---

## Configuration Walkthrough

### 1. Index Configuration
Open the **Indexes** tab to establish query acceleration and uniqueness constraints:
- **Primary Key**: Designate one or more primary key columns (standard tables accept exactly one primary key).
- **Unique Indexes**: Guarantee business uniqueness (such as phone numbers, emails, or tenant-scoped identifiers).
- **Secondary Indexes**: Select columns from autocomplete recommendations to construct single or **composite indexes**.
- **Custom Index Naming**: Edit or double-click index names to customize them. If left blank, DDLBuilder automatically generates compliant identifiers (e.g., `idx_table_columns`).

### 2. AI Index Advisor
When fine-tuning indexes for complex or slow query workloads:
1. Click the **AI Index Advisor** button.
2. Paste typical business queries or slow query SQL snippets.
3. The AI analyzes table columns, existing indexes, and query predicate structures to provide **missing index recommendations**, **redundant index detection**, **column ordering optimizations**, and **query rewrite tips**.
4. Click **Add Index** on any recommended action to immediately incorporate it into your configuration and update your DDL.

### 3. Privilege Configuration (DCL)
Open the **Privileges** tab to manage data access permissions:
- Enter target **user or role identifiers** (e.g., `app_user`, `readonly_role`).
- The right-hand **Privilege DCL** panel automatically outputs standard `GRANT SELECT, INSERT, UPDATE, DELETE ON table TO user;` statements.
- If a `Schema Name` is defined, privilege statements automatically inherit the fully qualified table identifier.

### 4. Miscellaneous Settings (Storage & Dialect Parameters)
Open the **Misc** tab and toggle the switch to configure low-level engine parameters:
- **Engine & Charset**: Set MySQL/MariaDB `ENGINE` (e.g., InnoDB), `CHARACTER SET` (e.g., `utf8mb4`), and `COLLATE`.
- **Physical Storage**: Configure `TABLESPACE`, PostgreSQL `fillfactor`, Oracle `PCTFREE`, `INITRANS`, and other dialect-specific clauses.
- **Routine Skeletons**: Select templates for Stored Procedures, Functions, or Triggers to generate structured code skeletons directly in the output panel.

---

## Verification Checklist

- [ ] Critical filter and join columns are indexed, and business keys have unique constraints.
- [ ] Index names follow naming conventions and have no duplicate or empty column sets.
- [ ] Authorized roles are listed, and valid DCL statements appear in the output panel.
- [ ] Enabled storage options correctly render at the end of the `CREATE TABLE` DDL.

## Tips and Common Traps

::: tip Activating Misc Parameters
If parameter changes in the Misc tab do not appear in the DDL, ensure the master **Enable Misc Options** toggle at the top of the tab is switched on.
:::

- **Single Primary Key**: Relational databases enforce a single primary key per table. Do not attempt to add multiple independent primary key constraints.
- **Empty DCL Output**: An empty DCL panel indicates that no grantee users or roles have been added. This is normal behavior and does not invalidate your DDL.
