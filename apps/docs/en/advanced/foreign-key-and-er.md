# Foreign Key Configuration and ER Diagram

## Who this is for

For users who need to define table relationships and want to view overall data structure visually.

## What this solves

You can clarify foreign key constraints and cascade rules during the design phase, avoiding data integrity issues after launch; the ER diagram helps teams quickly understand table relationships.

## Prerequisites

- The current table has at least one field.
- The target table and fields for association are already identified.
- To create a relationship from the ER diagram, save both the source and target tables in the current workspace first.
- The ER relationship wizard can reference only a single-column primary or unique key on the target table.

## Create a relationship from the ER diagram

1. Click `ER Diagram` at the top of the table configuration area. Result: the system shows saved tables and existing relationships in the current workspace.
2. Drag from the connection handle on the left side of a source field to the handle on the right side of a target field. Result: the relationship wizard opens with the source and target fields selected.
3. Confirm the source and target fields. Result: the target list allows only single-column primary or unique keys and shows a warning when field types differ.
4. Select `Many-to-one` or `One-to-one`. Result: one-to-one ensures that the source field has a unique constraint, while many-to-one can create a regular index for the source field when needed.
5. Select `Required` or `Optional`. Result: the source field becomes `NOT NULL` or `NULL`; a required relationship cannot use `SET NULL`.
6. Review the relationship name, update action, delete action, and index option. Actions default to `NO ACTION`; choose `CASCADE`, `SET NULL`, or another action only when required by the business semantics.
7. Review the change preview and click `Create Relationship`. Result: the foreign key, field nullability, and required index are written to the source table together, and the ER diagram refreshes with the new relationship line.

## Create a relationship from the foreign key panel

1. Switch to the `Foreign Key Configuration` tab in the table configuration area. Result: the foreign key management panel opens.
2. Click `Add Foreign Key`. Result: a foreign key editing row expands.
3. Enter the `Foreign Key Name`, then select the current table field, referenced table, and referenced field. Result: the relationship is established.
4. Set the `Update Rule` and `Delete Rule` as needed. Result: referential behavior is defined and the DDL updates immediately.
5. Repeat these steps to add more foreign keys. Result: the current table can reference multiple tables.

## Inspect and arrange the ER diagram

1. Drag table nodes to arrange the layout. Result: node positions change without modifying table schemas.
2. Zoom with the mouse wheel or use automatic layout in the toolbar. Result: tables and relationships remain easy to locate in large workspaces.
3. Read the delete and update actions from the relationship label; use the delete control beside the line when removal is needed. Result: the corresponding foreign key is removed from the source table.

## Done when

- Foreign key configuration panel lists all target foreign keys, with correct fields, related tables, and related fields.
- DDL on the right already contains `FOREIGN KEY` statements.
- ER diagram correctly shows relationship lines between current table and associated tables.
- A one-to-one source field has a primary or unique index; many-to-one relationships that need query acceleration have a suitable index.
- Update/delete rules match business expectations.

## Common pitfalls

- When foreign key field and related field types are incompatible, generated DDL may fail on the target database. Confirm type matching in advance.
- The wizard blocks creation when the target is not a single-column primary or unique key. Add a primary or unique index to the target field first.
- Tables with the same name may represent different saved records. The ER diagram keeps these nodes separate and does not guess which duplicate target should receive a relationship.
- The wizard blocks duplicate names and duplicate relationships between the same fields.
- Not all databases support all cascade rules (e.g., SET NULL requires the field to be nullable). Confirm target database support before selecting.
