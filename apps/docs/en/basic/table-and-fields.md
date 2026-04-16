# Table and Field Configuration

## Who this is for

For users who are already on the editor page and want to turn a table from "blank" into "DDL-ready".

## What this solves

You can complete table-level and field-level input in one screen and quickly produce a table schema draft ready for review.

## Steps

1. In "Table Config", fill in `Schema Name` when needed, together with `Table Name`, `Table Comment`, and `Database Type`. Result: the system generates subsequent SQL with the target database syntax; when `Schema Name` is not empty, table objects are emitted as `schema.table`.
2. In "Fields", enter `Field Name`, `Comment`, and `Type` row by row. Result: the base field structure appears in the DDL on the right in real time.
3. Configure `Nullable`, `Default Kind`, `Default Value`, and `On Update` based on field rules. Result: constraints and default behavior are written into SQL.
4. Use `Add Rows` in the toolbar for bulk field input. Enable `Freeze` when needed to keep key columns visible. Result: editing large tables becomes faster and horizontal scrolling is less error-prone.
5. To reuse fields, use `Apply Template` to select an existing template, or save current fields as a template. Result: similar tables can quickly reuse a standardized field set.
6. To estimate volume, click `Estimate Size` and adjust expected row count. Result: you get per-row and total-size estimates for early capacity discussions.

## Done when

- The field list covers core fields for this table, and each row has complete field information.
- DDL on the right updates in real time as fields change, with no blank structure.
- If `Schema Name` is used, SQL on the right already shows the qualified table name.
- If templates are used, template fields are successfully applied to the current table.

## Common pitfalls

- Duplicate field names or reserved keywords will trigger warnings. Rename first before continuing.
- When `Schema Name` is empty, generation keeps the original bare table name behavior. Keep the table field for the table name only, and do not mix `schema.table` into it.
- Filling only field names without setting field types leads to incomplete structure information.
- After large paste operations, spot-check "Default Kind" and "On Update" by column to avoid misalignment.
