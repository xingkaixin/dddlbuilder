# DDL output and sharing

This page explains how to view and copy table DDL, privilege DCL, ORM models, and routine code, and how to share a table structure with a read-only link.

## Overview

After you finish the table design, hand the SQL to a database review or a change ticket, put the ORM code in your application project, or send a link to colleagues so they can look at the design.

---

## Operations walkthrough

### 1. View each output
**Generated output** has these tabs:
- **DDL**: the `CREATE TABLE` statement with the primary key, field constraints, comments, indexes, and partitioning. If **Schema Name** is filled in, the table name is output as `schema.table`.
- **DCL**: a `GRANT SELECT` statement for each grantee.
- **ORM**: choose Prisma, TypeORM, SQLAlchemy, GORM, or JPA under **ORM Framework** to generate the matching model code.
- **Routines**: skeleton code for stored procedures, functions, and triggers. When the object type is a view, the `CREATE VIEW` statement appears on the **DDL** tab.

### 2. Copying and output formatting
- Click **Copy DDL**, **Copy DCL**, **Copy ORM Code**, or **Copy Routine** on the matching tab to copy the code to your clipboard.
- The **DDL** tab can switch between **Compact** and **Aligned** formatting. The copied text matches the format on screen.

### 3. Switch between design and output
When **Split preview** on the right of the tab bar is on, the design area is on top and the generated output is below. For tables with many fields, click **Collapse output panel** at the top of the output to show only the design area. Click **Generated output** when you want to see the code again.

### 4. Generate a read-only share link
1. Click **Share** at the top.
2. DDLBuilder creates a read-only link and copies it to your clipboard. The link expires after 7 days.
3. The link contains the current table's name, schema name, fields, constraints, indexes, and misc settings.

### 5. Recipients save a copy
- A page opened from a share link is read-only and cannot be edited directly.
- To make changes, click **Save as copy and edit** in the banner at the top. DDLBuilder saves the copy into the recipient's own workspace and opens it, and further edits apply to that copy.

---

## Database versions and special objects

::: info Database dialect details
- **Oracle synonyms**: generated DDL no longer adds `PUBLIC SYNONYM` automatically. If you need synonyms, have a DBA with the required privileges create them separately.
- **MySQL complex defaults**: constant default values for TEXT, BLOB, or JSON types use parenthesized expression syntax (for example `DEFAULT ('{}')`), which requires MySQL 8.0.13 or newer.
- **Escaping**: MySQL-family string literals are output assuming backslash escaping. If the target session enables `NO_BACKSLASH_ESCAPES`, check the escaping before you run the SQL.
:::

---

## Verification checklist

- [ ] The copied SQL or ORM code runs or compiles in the target client.
- [ ] If **Schema Name** is filled in, every output uses the table name with the schema prefix.
- [ ] The share link opens in a private window or on another computer, and the page is read-only.
- [ ] After you click **Save as copy and edit**, the copy opens in the workspace and can be edited.
