# Quick Start

This guide helps first-time DDLBuilder users design their first database table in minutes and export production-ready SQL DDL, DCL, and ORM models.

## Overview

Eliminate the tedium of handcrafting SQL for multiple database dialects. With DDLBuilder's visual interface, you can model table schemas, define constraints, and instantly obtain accurate DDL, DCL, ORM models, and routine skeletons.

## Step-by-Step Walkthrough

### 1. Select Dialect and Basic Information
- Select your target **Database Type** in the table configuration header (e.g., MySQL, PostgreSQL, Oracle, TiDB).
- Enter the **Table Name** (e.g., `user_account`) and optional **Display Name** (e.g., `User Account Table`).
- **Schema Name** (Optional): If your database supports namespaces (such as PostgreSQL, Oracle, or SQL Server), entering a schema name automatically formats SQL object identifiers as `schema.table`.

::: tip Table Name Convention
Enter only the bare table name into the `Table Name` field. When namespace scoping is required, use the dedicated `Schema Name` input rather than manually prefixing `schema.table`.
:::

### 2. Configure Columns and Constraints
- Add columns in the **Field Configuration** table with column names, display labels, and data types.
- Specify nullability (**Null / Not Null**), **Default Type** (such as constants, current timestamp, UUID), and default values.
- The **Table DDL** panel on the right updates in real time with formatted SQL.

### 3. Add Indexes, Privileges, and Options
- **Indexes**: Quickly configure primary keys, unique constraints, and composite query indexes to ensure optimal query performance.
- **Privileges**: Enter grantee roles or users to automatically generate standard `GRANT` (DCL) statements.
- **Misc Options**: Configure storage engines, character sets, collations, or tablespace parameters as needed.

### 4. Kickstart with Table Blueprints (Optional)
When modeling standard domain entities (such as user accounts, orders, or audit logs), click **Table Blueprint** in the top navigation to apply a pre-built template with one click, then customize it for your needs.

### 5. Reverse-Engineer Existing Schemas (Optional)
If you already have SQL scripts or data files, click **Import SQL** or **Import Data** (CSV, Excel, JSON Schema) to automatically parse columns, types, and indexes into your workspace.

### 6. Copy and Export Artifacts
- Click **Copy DDL** or **Copy DCL** in the output panel to copy SQL directly to your clipboard.
- Switch to the **ORM** tab to export models for Prisma, TypeORM, SQLAlchemy, GORM, or JPA.
- Switch to the **View/Routine** tab to generate view definitions or procedure/function/trigger templates.

### 7. Save and Multi-Tab Management
- Click the **Save icon** next to the table name to save the current table into your "Saved Tables" drawer.
- The workspace supports **multiple tabs** simultaneously, letting you design separate tables in isolation.

---

## Verification Checklist

- [ ] The output panel shows a complete, syntactically valid `CREATE TABLE` statement.
- [ ] If a `Schema Name` is specified, the DDL/DCL outputs reflect the fully qualified table name.
- [ ] Clicking copy buttons triggers a successful "Copied" toast notification.
- [ ] The newly saved table is visible in the "Saved Tables" drawer.

## Tips and Common Traps

::: warning Database Dialect Matching
Switching the database type recalculates type mappings and syntax constraints. Always confirm the target database type before extensive editing.
:::

- **Account Sign-In & Cloud Sync**: In guest mode, data is kept in your local browser storage. Sign in with your email account to enable automatic real-time cloud synchronization across devices.
- **Unsaved Changes**: Closing a tab with unsaved edits will trigger a confirmation dialog to safeguard your work against accidental loss.
