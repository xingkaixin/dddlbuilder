# Table and Field Configuration

## Who this is for

For users who are already on the editor page and want to turn a table from "blank" into "DDL-ready".

## What this solves

You can complete table-level and field-level input in one screen and quickly produce a table schema draft ready for review.

## Steps

1. In "Table Config", fill in `Schema Name` when needed, together with `Table Name`, `Table Comment`, and `Database Type`. Result: the system generates subsequent SQL with the target database syntax; when `Schema Name` is not empty, table objects are emitted as `schema.table`.
2. In "Fields", enter `Field Name`, `Comment`, and `Type` row by row. Result: the base field structure appears in the DDL on the right in real time.
3. Configure `Nullable`, `Default Kind`, `Default Value`, and `On Update` based on field rules. Result: constraints and default behavior are written into SQL.
4. When configuring logical enums, expand the enum editor within the field row, add enum items, set color identifiers, and drag to reorder. Result: the field carries enum metadata for unified value specification during team collaboration.
5. Use `Add Rows` in the toolbar for bulk field input. Enable `Freeze` when needed to keep key columns visible, or switch to `Compact Layout` for higher information density on small screens. Result: editing large tables becomes faster and horizontal scrolling is less error-prone.
6. To reuse fields, use `Apply Template` to select an existing template, or save current fields as a template. Result: similar tables can quickly reuse a standardized field set.
7. To estimate volume, click `Estimate Size` and adjust expected row count. Result: you get per-row and total-size estimates that now include index volume, closer to actual physical usage.
8. To check design standards, open the `Schema Lint` panel. Result: the system scans current table structure against built-in naming conventions and type rules, highlighting potential issues.
9. To quickly fill test data, click `Mock Data` to generate sample data by field type and export. Result: development and testing phases can quickly obtain data conforming to the structure.
10. To establish table relationships, either enter one manually in `Foreign Key Configuration`, or save the source and target tables first and drag between field handles in `ER Diagram` to confirm cardinality, optionality, referential actions, and indexes in the wizard. Result: the system generates foreign key constraint DDL and displays the relationship in the ER diagram.

## Done when

- The field list covers core fields for this table, and each row has complete field information.
- DDL on the right updates in real time as fields change, with no blank structure.
- If `Schema Name` is used, SQL on the right already shows the qualified table name.
- If templates are used, template fields are successfully applied to the current table.
- If enums are configured, enum items are saved and color identifiers match expectations.
- Schema lint panel shows no error-level issues, or warnings are acknowledged.

## Common pitfalls

- Duplicate field names or reserved keywords will trigger warnings. Rename first before continuing.
- When `Schema Name` is empty, generation keeps the original bare table name behavior. Keep the table field for the table name only, and do not mix `schema.table` into it.
- Filling only field names without setting field types leads to incomplete structure information.
- After large paste operations, spot-check "Default Kind" and "On Update" by column to avoid misalignment.
- When modifying existing field types, if the system warns of data compatibility risks (e.g., truncation, precision loss), confirm whether the current database already has data before proceeding.
- When configuring foreign keys, associated field types must be compatible; otherwise generated foreign key DDL may fail on the target database.
- In the ER relationship wizard, the target field must be a single-column primary or unique key; one-to-one relationships also require a unique constraint on the source field.
