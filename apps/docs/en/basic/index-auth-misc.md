# Indexes, privileges, and misc

This page explains how to configure indexes, privilege statements (DCL), storage options under **Misc**, and routine skeleton code.

## Overview

After you define the fields, add indexes, privileges, and storage options.

---

## Configuration walkthrough

### 1. Index configuration
On the **Indexes** tab:
- **Add Primary Key**: select the primary key fields. A table can have only one primary key.
- **Add Unique Index**: use it for fields that must be unique, such as phone numbers, emails, or tenant codes.
- **Add Index**: creates a normal index. Select one or more fields from **Field suggestions**. Selecting several fields creates a composite index.
- **Index name**: if left empty, the name is generated as `idx_<table>_<fields>`. Unique indexes use the `uk_` prefix. Names longer than the database's identifier limit are truncated. Double-click an added index name to change it.

### 2. AI Index Advisor
When you are not sure which indexes your common queries need:
1. In the **Fields** toolbar, open the **AI tools** menu and click **AI Index Advisor**.
2. Paste common queries or slow query snippets into **Typical query SQL**, one per line, then click **Analyze Indexes**.
3. AI makes suggestions based on the current fields and existing indexes, grouped into categories such as **Missing Index**, **Redundant Index**, **Order Optimization**, and **Query Rewrite**.
4. To accept a suggestion, click **Add Index**. The index is added to the **Indexes** tab and the DDL updates.

### 3. Privilege configuration (DCL)
On the **Privileges** tab:
- Enter a grantee (a user or role, such as `app_user` or `readonly_role`) and click **Add**.
- The **DCL** tab in **Generated output** contains one `GRANT SELECT ON table TO grantee;` statement per grantee.
- If **Schema Name** is filled in, the table name in the statement has the schema prefix.

### 4. Misc settings (storage and database options)
On the **Misc** tab, turn on **Enable miscellaneous options** to set the storage options supported by the current database:
- **Engine and charset**: MySQL/MariaDB `ENGINE` (for example InnoDB), `CHARACTER SET` (for example `utf8mb4`), and `COLLATE`.
- **Physical storage**: `TABLESPACE`, PostgreSQL `fillfactor`, Oracle `PCTFREE`, `INITRANS`, and other database-specific clauses.

### 5. Routine skeleton code
In **Generated output**, switch to the **Routines** tab and choose a template (Procedure, Function, Auto Updated Timestamp Trigger, Audit Log Trigger, or Custom Trigger). Fill in the name and other parameters to generate skeleton code, then add the business logic in your database.

---

## Verification checklist

- [ ] Common query and filter fields have indexes, and fields that must be unique have unique indexes.
- [ ] Index names are not duplicated, and no index is missing its fields.
- [ ] All users or roles that need access are added, and the **DCL** tab has one `GRANT` statement for each.
- [ ] With misc options enabled, the storage options appear at the end of the `CREATE TABLE` statement.

## Common issues

::: tip Misc settings not applied
If the parameters you set under **Misc** do not appear in the DDL, check that the **Enable miscellaneous options** switch at the top of the tab is on.
:::

- **Single primary key**: a table can have only one primary key. If one already exists, clicking **Add Primary Key** shows "Primary key already exists".
- **No grantees**: when no grantees are added, the **DCL** tab shows `-- Please configure grantees`. The table DDL is not affected.
