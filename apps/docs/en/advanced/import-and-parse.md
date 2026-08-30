# Import and Parse SQL

This guide explains how to reverse-engineer existing SQL scripts, batch DDL statements, or structured data files (CSV, Excel, JSON Schema) into editable schema models.

## Overview

Accelerate migrations, legacy system refactoring, and data dictionary ingestion by importing existing schemas rather than typing column definitions from scratch.

---

## Operations Walkthrough

### 1. Single and Multi-Table SQL Reverse-Engineering
DDLBuilder uses a secure three-step **"Validate → Preview → Confirm"** workflow:
1. Click the **Import SQL** button in the top navigation bar.
2. **Select the Source Database Dialect** and paste your SQL script (supports single or multiple `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, and `GRANT` statements).
3. Click "Next" to validate syntax and parse schema structures.
4. **Inspect and Refine in the Preview Panel**:
   - Verify extracted columns, data types, primary keys, indexes, and privilege grants.
   - Reorder columns by dragging handles or delete unwanted columns directly within the preview modal.
   - For multi-table imports, DDLBuilder detects name collisions and offers merge strategies: **Overwrite, Skip, or Auto-Rename**.
5. Click "Confirm Import" to apply changes atomically to the workspace. If the source SQL contains namespace identifiers (e.g., `CREATE TABLE sales.orders`), the system splits `sales` into `Schema Name` and `orders` into `Table Name`.

### 2. Structured Data File Imports (CSV / Excel / JSON Schema)
1. Click **Import Data** in the top navigation and choose your file format:
   - **CSV Files**: Uses the first row as column headers and infers data types from sample rows.
   - **Excel Spreadsheets (.xlsx / .xls)**: Automatically extracts header rows and maps cell data types.
   - **JSON Schema**: Extracts `properties` fields, types, formats, and descriptions.
2. Upload your file, review inferred data types in the preview table, and manually adjust any column mappings if necessary.
3. Confirm the import to populate your workspace with the extracted columns.

---

## Supported Formats and Parser Behavior

| Source / Format | Supported Constructs & Specifications | Parser Behavior |
|---|---|---|
| **SQL Scripts** | `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`, `GRANT` | Extracts constraints, defaults, comments, composite indexes, and grants |
| **CSV Files** | UTF-8 encoded, comma-delimited, header row | Infers `INT`, `DECIMAL`, `VARCHAR`, `DATETIME` from sample data |
| **Excel Files** | Standard `.xlsx` and `.xls` workbooks | Uses first row as field names; infers types from cell values |
| **JSON Schema** | Draft-07 / 2020-12 compliant schemas | Maps `properties` (`string`, `integer`, `boolean`, `number`) to database columns |

---

## Verification Checklist

- [ ] Workspace accurately reflects imported table names, columns, constraints, and indexes.
- [ ] Qualified schema prefixes are correctly separated into `Schema Name` and `Table Name`.
- [ ] The output panel generates valid, clean DDL and DCL for your target dialect.

## Tips and Troubleshooting

::: tip Dialect Mismatch Check
If the parser reports a syntax error, confirm that the **Source Database Dialect** in the import modal matches the SQL's actual syntax (e.g., using an Oracle script with a MySQL parser).
:::

- **Splitting Large Scripts**: For massive SQL dump files containing dozens of tables, split scripts by business domain to maintain optimal browser parsing responsiveness.
- **Encoding and Protection**: Ensure CSV files are encoded in UTF-8. Remove password encryption on Excel spreadsheets prior to upload.
- **Nested JSON Schemas**: Deeply nested JSON schemas should be simplified or flattened to reflect relational table entities before importing.
