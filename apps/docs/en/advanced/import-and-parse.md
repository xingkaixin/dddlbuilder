---
title: "Import CREATE TABLE SQL and edit database schemas"
description: "Import SQL into DDLBuilder, preview columns, keys and indexes, then edit and export DDL. Learn multi-table imports, conflict handling and CSV, Excel or JSON Schema imports."
---

# Import CREATE TABLE SQL and edit database schemas

Open the [DDLBuilder workspace](https://ddl.xingkaixin.me/) and follow the import steps below. After importing related tables, check their [foreign keys and ER diagram](/en/advanced/foreign-key-and-er), then [generate ORM models](/en/advanced/orm-generation).

This guide explains how to import existing SQL scripts or field-definition files (CSV, Excel, JSON Schema) as editable table schemas.

## When to use

Use this when you refactor a legacy system, migrate an old project's database, or create tables from third-party API definitions or an Excel data dictionary.

---

## Steps

### 1. Import single-table or multi-table SQL
1. Click **Import Schema** in the header. To save several tables at once, set **Import mode** to **Save as saved tables**.
2. Set **Source Type** to SQL, choose the **Source Database**, and paste the SQL script. It can contain one or more `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE` and `GRANT` statements.
3. Click **Next** to validate the syntax and parse the table structure.
4. Review and adjust the result:
   - When importing into the workspace, the preview shows the parsed columns, data types, primary keys, indexes and grantees. You can edit column names, types and nullability, move columns up or down, or delete them. Then click **Next**.
   - With **Save as saved tables**, there is no column preview. Select the tables to import, click **Next**, then choose a **Target Folder** and a **Conflict Strategy**: **Skip existing**, **Overwrite existing** or **Auto rename**.
5. Click **Import** (or **Confirm Import** when saving as saved tables). If the SQL uses a schema prefix (for example `CREATE TABLE sales.orders`), `sales` goes into `Schema Name` and `orders` into `Table Name`.

### 2. Import field-definition files (CSV / Excel / JSON Schema)

For actual order records or customer lists, use [Business Data Import](/en/advanced/business-data-import). CSV / Excel imports on this page read field-definition lists.

1. Click **Import Schema** in the header and choose a **Source Type**:
   - **CSV / TSV**: The first row is a header (field name, field type, field comment). Each following row describes one field.
   - **Excel** (.xlsx / .xls): Each worksheet becomes one table, named after the sheet. Row 1 is the header (field name, field type, field comment), and each following row is one field.
   - **JSON Schema / OpenAPI**: Reads the fields in `properties` with their types, formats and descriptions.
2. Upload the file, click **Next**, check the fields and types in the preview, and edit them as needed.
3. Click **Import** to write the fields to the current workspace.

---

## Supported formats and parser behavior

| Source / format | Supported syntax and requirements | Parser behavior |
|---|---|---|
| **SQL scripts** | `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `GRANT` | Extracts column constraints, defaults, comments, composite indexes and grants |
| **CSV files** | UTF-8 encoded, comma-delimited, header row | Reads field names, explicit SQL types and comments |
| **Excel files** | `.xlsx` and `.xls` workbooks | Reads field-definition lists from each worksheet |
| **JSON Schema** | JSON Schema, Swagger or OpenAPI documents | Extracts `properties` and maps field types from `type` and `format`; `object` and `array` map to `json` |

---

## Verification checklist

- [ ] The workspace shows the parsed table names, columns, constraints and indexes.
- [ ] If the source SQL has a schema prefix, `Schema Name` and `Table Name` hold the two parts.
- [ ] The DDL and DCL in the generated output match the syntax of the target database.

## Notes and troubleshooting

::: tip Dialect mismatch
If the import reports a syntax error, first check that **Source Database** in the import dialog matches the SQL's actual syntax, for example Oracle SQL with MySQL selected.
:::

- One SQL import accepts up to 50,000 characters. Split larger scripts by business module.
- Save CSV files as UTF-8. Remove password protection from Excel files before uploading.
- Nested `object` and `array` properties in a JSON Schema import as a single `json` field. To get separate tables, split the entities in the JSON Schema before importing.
