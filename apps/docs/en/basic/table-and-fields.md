# Table and field configuration

This page explains each setting in the table configuration area and the **Fields** table, plus the helper tools in the field table toolbar.

## Overview

Use this page when you create a new table, or add and change fields and constraints on an existing one.

---

## Configuration walkthrough

### 1. Table-level metadata
In the table configuration area at the top, fill in:
- **Database Type**: select the target database, such as MySQL, PostgreSQL, or Oracle.
- **Table Name** and **Table Comment**: for example `order_item` and `Order items`.
- **Schema Name** (optional, under **Properties**): fill it in when the target database separates objects by schema. For example, entering `sales` outputs the table name as `sales.order_item`. Do not put the schema in the table name.

### 2. Fields and constraints
In the **Fields** table, set the following for each field:
- **Field Name** and **Comment**: the field identifier and its description.
- **Type**: a type supported by the current database, such as `BIGINT`, `VARCHAR(255)`, `DECIMAL(10,2)`, or `JSON`.
- **Nullable**: choose **No** to generate `NOT NULL`.
- **Default Kind** and **Default Value**: **Default Kind** can be **None**, **Auto Increment**, **Constant**, **SQL expression**, **Current Time**, or **UUID**. Fill in **Default Value** when a specific value is needed.
- **On Update**: choose **Current Time** to generate `ON UPDATE CURRENT_TIMESTAMP`.

### 3. Editing tips
- Click **Add Rows** in the toolbar to append empty rows to the end of the table. Use the plus and minus buttons next to it to change how many rows each click adds. Drag the handle at the start of a row to reorder fields.
- When the table scrolls horizontally, turn on the **Freeze** switch to keep the leading columns visible. Use the plus and minus buttons to change how many columns stay frozen.
- Click **Apply Template** to insert a saved field template, for example a set of `created_at`, `updated_at`, and `created_by` audit fields. Choose **Save current rows as template...** in the same menu to save the current fields as a template.

### 4. Business metadata and helper tools
- **Logical enums**: for a field with a limited set of values, such as a status code, click **Edit enum values** in the **Type** cell. In the dialog, enter the enum values, Chinese and English comments, and color tags. The enum data is saved with the table.
- **Size estimate**: in the **Data tools** menu, click **Estimate Size** and enter the expected row count. The result is split into raw data, indexes, and overhead. Use it for capacity planning. It is not an exact measure of actual disk usage.
- **Schema lint**: click **Schema Lint** at the bottom of the editor to see issues such as naming problems, risky field types, or a missing primary key.
- **Mock test data**: in the **Data tools** menu, click **Mock Data** to generate test data from the field types. You can export it as INSERT SQL, CSV, or JSON.

---

## Verification checklist

- [ ] All fields the business needs are present, with correct types and lengths.
- [ ] The primary key and `NOT NULL` constraints are set, and fields that need a default have a **Default Kind**.
- [ ] The SQL on the **DDL** tab is complete, with no syntax errors or blank placeholders.
- [ ] **Schema Lint** shows no issues at the **Error** level.

## Common issues and troubleshooting

::: warning Field type and length changes
When you change a field type or shorten a field length, DDLBuilder shows **Data Type Change Risk** or **Field Length Reduction Risk**, which explains possible conversion failures, truncation, or data loss. Check the change, then click **Change Anyway**, or click **Cancel** to discard it.
:::

- **Reserved keywords**: when a field name is a reserved keyword in the target database (for example `order` or `group`), the table shows "Field name is a reserved keyword", and the generated DDL quotes the field name using that database's rules.
- **Foreign key requirements**: when you configure a foreign key or draw a relationship line in the ER diagram, the referenced field must be a single-field primary key or a unique index column, and the data types on both sides must be compatible.
