# Table and Field Configuration

This guide details how to configure table-level metadata, column definitions, data types, business constraints, and advanced field features to generate reliable DDL.

## Overview

Use the visual editor to design greenfield database tables or evolve existing schemas while guaranteeing conformance to your chosen database dialect's syntax and type rules.

---

## Configuration Walkthrough

### 1. Table-Level Metadata
Configure table identifiers in the top configuration header:
- **Database Type**: Select your target database dialect (e.g., MySQL, PostgreSQL, Oracle, SQL Server).
- **Table Name & Display Name**: Enter the physical table name (e.g., `order_item`) and descriptive business label (e.g., `Order Item Details`).
- **Schema Name (Optional)**: If your database uses namespace isolation (e.g., `sales.order_item`), enter the schema name in the dedicated input. Do not manually prefix the table name.

### 2. Columns and Constraints
Define column properties in the **Field Configuration** table:
- **Field Name & Label**: Specify the column identifier and its business description.
- **Data Type**: Select from dialect-aware data types (such as `BIGINT`, `VARCHAR(255)`, `DECIMAL(10,2)`, `JSON`).
- **Nullability**: Explicitly mark columns as `NOT NULL` or `NULL`.
- **Default Type & Default Value**: Choose from constant values, empty strings, current timestamp (`CURRENT_TIMESTAMP`), UUIDs, or dialect-specific expressions.
- **Update Policy**: Configure automatic update triggers for timestamp columns (e.g., `ON UPDATE CURRENT_TIMESTAMP`).

### 3. Productivity & Layout Features
- **Batch Row Insertion & Reordering**: Click "Add Rows" to quickly insert multiple column rows. Drag rows by their left handles to reorder columns in the DDL.
- **Frozen Columns & Compact Layout**: Pin key identifier columns with "Freeze Columns" when scrolling horizontally. Toggle "Compact Layout" on smaller displays to maximize visible information density.
- **Field Templates**: Click "Apply Template" to insert standard audit column bundles (e.g., `created_at`, `updated_at`, `created_by`), or save current columns as a reusable team template.

### 4. Advanced Metadata & Tools
- **Logical Enums**: For finite status columns, expand the inline enum editor to specify valid values, labels, and visual color badges. This metadata persists with the table to document business rules.
- **Storage Capacity Estimation**: Click "Estimate Storage" and input projected row counts. The tool computes physical disk usage including row width and index overhead.
- **Schema Lint**: Run the built-in Schema Lint checker to catch naming convention violations, problematic data types, or missing primary keys.
- **Mock Data Generator**: Click "Mock Data" to generate realistic sample datasets based on column types, exportable as SQL INSERT statements, CSV, or JSON.

---

## Verification Checklist

- [ ] All core domain fields are accurately defined with appropriate types and lengths.
- [ ] Primary key and non-null constraints are correctly applied.
- [ ] The DDL output panel updates in real time with syntactically valid SQL.
- [ ] The Schema Lint panel reports no critical errors.

## Common Traps and Guidance

::: warning Column Type Migrations
Modifying data types on established tables may trigger compatibility warnings (such as truncation or precision loss). Carefully inspect warnings before applying changes.
:::

- **Reserved Keywords**: When a column name matches a database reserved word (e.g., `order`, `status`, `group`), the system displays a warning and automatically quotes the identifier in generated DDL.
- **Foreign Key Requirements**: When configuring foreign keys or drawing relationship lines in the ER diagram, target columns must be single-column primary keys or unique index targets with matching data types.
