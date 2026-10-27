---
title: "Generate MySQL and PostgreSQL CREATE TABLE SQL"
description: "Configure columns, primary keys and indexes visually in DDLBuilder. Generate CREATE TABLE SQL for MySQL and PostgreSQL, with a MySQL import example and output checks."
---

# Generate MySQL and PostgreSQL CREATE TABLE SQL

[Start designing in DDLBuilder](https://ddl.xingkaixin.me/) and follow the steps below to create your first table. If you already have SQL, start with [SQL import and parsing](/en/advanced/import-and-parse).

## Example: generate a MySQL user table

Create a user table with a primary key `id`, a required and unique `email`, and an optional `display_name`. Use this SQL as an import example.

```sql
CREATE TABLE user_account (
  id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX uk_user_account_email ON user_account (email);
```

1. Open [DDLBuilder](https://ddl.xingkaixin.me/), click **Import Schema** at the top, set **Source Type** to SQL and **Source Database** to MySQL, then paste the example.
2. Check the preview for three columns, the `id` primary key and the unique index on `email`, then import the table.
3. Change the length of `display_name` to `150`. In **Generated output**, check that the **DDL** tab contains `VARCHAR(150)`, then copy the SQL.

Formatting, identifier quoting and index statement placement may differ in the output. Check column types, nullability, the primary key and the unique index. When switching databases, review type and default-value compatibility. The tool does not connect to a database or execute SQL.

Continue with [SQL to ER diagrams](/en/advanced/foreign-key-and-er) for relationships or [SQL to ORM models](/en/advanced/orm-generation) for application code.

## Overview

You configure the table structure in the interface, and DDLBuilder generates table DDL, privilege DCL, ORM model code, and SQL for views and routines for the selected database as you edit. You do not have to write SQL by hand for each database.

## Step-by-step walkthrough

### 1. Select the database and basic information
- Select the **Database Type** in the table configuration area (for example MySQL, PostgreSQL, Oracle, or TiDB).
- Enter the **Table Name** (for example `user_account`) and the **Table Comment** (for example `User accounts`).
- If your database supports namespaces (such as PostgreSQL, Oracle, or SQL Server), you can enter a **Schema Name** under **Properties** (optional). The generated SQL then uses `schema.table` as the table name.

::: tip Table name convention
Enter only the table name in **Table Name**. When you need a namespace, fill in **Schema Name** instead of typing `schema.table` into the table name.
:::

### 2. Configure fields and constraints
- In the **Fields** table, enter the **Field Name**, **Comment**, and **Type** for each row.
- Set **Nullable** (`NOT NULL` / `NULL`), **Default Kind** (for example Constant, Current Time, or UUID), and **Default Value** as needed.
- The **DDL** tab in **Generated output** updates as you type.

### 3. Add indexes, privileges, and other options
- On the **Indexes** tab, add a primary key, unique indexes, or normal indexes. One index can include several fields.
- On the **Privileges** tab, add users or roles to generate `GRANT` statements (DCL).
- On the **Misc** tab, set the storage engine, character set, collation, or tablespace.

### 4. Apply a table blueprint (optional)
A table blueprint is a table structure you saved yourself. DDLBuilder has no built-in blueprints. Click **Table Blueprint** in the **Fields** toolbar, choose a blueprint, and click **Apply Blueprint**. DDLBuilder opens a new draft tab with the blueprint's fields, indexes, database type, and table-level options. The new tab keeps the current table name, table comment, schema name, and grantees, and does not include foreign keys.

If you have no blueprints yet, choose **Save current table as blueprint...** in the same menu. Blueprints are stored in the current browser.

### 5. Import an existing schema (optional)
If you already have SQL or a schema file, click **Import Schema** at the top. **Source Type** can be SQL, CSV / TSV, Excel, or JSON Schema / OpenAPI. DDLBuilder parses the fields, types, and indexes and loads them into the workspace.

### 6. Copy and export the output
- In **Generated output**, click **Copy DDL** or **Copy DCL**, then paste the SQL into your database client or change ticket.
- Switch to the **ORM** tab to generate Prisma, TypeORM, SQLAlchemy, GORM, or JPA model code.
- Switch to the **Routines** tab to generate skeleton code for stored procedures, functions, and triggers. When the object type is a view, the `CREATE VIEW` statement appears on the **DDL** tab.

### 7. Save tables and work in tabs
- Click the save icon (tooltip **Save current table**) in the table configuration area and enter a name. The table then appears under **Projects** in the left **Workspace** sidebar. You can open it from there later, or check its **Version history** in the table configuration area.
- The workspace can keep several tabs open. Each tab edits one table.

---

## Registration and email verification (optional)

Local modeling does not require an account. To sync an account workspace, open registration in the upper-right corner and enter your email and password.

1. After registration, enter or paste the six-digit code from the email into the authentication dialog.
2. The code is valid for 10 minutes. Successful verification signs you in automatically.
3. If the email has not arrived, check your spam folder. You can resend after the 60-second countdown; use the latest code.

Registration does not require a CAPTCHA. Existing accounts with unverified email addresses can also complete verification in the authentication dialog. For more troubleshooting steps, see the account and sync section in [errors and failure handling](/en/faq/common-errors).

## Verification checklist

- [ ] The **DDL** tab shows a complete `CREATE TABLE` statement that is valid for the target database.
- [ ] If you entered a **Schema Name**, the table name in the DDL and DCL has the schema prefix.
- [ ] Clicking a copy button shows **Copied**.
- [ ] The table you just saved appears under **Projects** in the left **Workspace** sidebar.

## Common issues

::: warning Database type matching
If you switch the database type partway through, DDLBuilder adjusts type mappings and syntax for the new database. Confirm the target database type before you start designing.
:::

- Without an account, data is stored only in the current browser. After you click **Sign in** in the upper-right corner and sign in, the workspace syncs to the cloud automatically, and you can keep editing on another device signed in to the same account.
- Closing a tab does not ask for confirmation. Current edits are saved as a draft automatically and do not overwrite the saved table.
