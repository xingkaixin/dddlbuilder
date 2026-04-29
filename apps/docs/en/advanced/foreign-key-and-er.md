# Foreign Key Configuration and ER Diagram

## Who this is for

For users who need to define table relationships and want to view overall data structure visually.

## What this solves

You can clarify foreign key constraints and cascade rules during the design phase, avoiding data integrity issues after launch; the ER diagram helps teams quickly understand table relationships.

## Prerequisites

- The current table has at least one field.
- The target table and fields for association are already identified.

## Steps

1. Switch to the `Foreign Key Configuration` tab in the table configuration area. Result: enter the foreign key management panel.
2. Click `Add Foreign Key`. Result: a foreign key editing row expands.
3. Fill in `Foreign Key Name` (optional, system can auto-generate), select `Field` (current table field), `Related Table`, and `Related Field`. Result: the foreign key relationship is established.
4. Set `Update Rule` and `Delete Rule` as needed (such as CASCADE, SET NULL, RESTRICT, etc.). Result: cascade behavior is defined.
5. Repeat the above steps to add more foreign keys. Result: the current table can be associated with multiple tables.
6. Click `View ER Diagram`. Result: the system opens an ER diagram popup, rendering all table nodes and relationship lines based on React Flow.
7. In the ER diagram, drag nodes to adjust layout, zoom with scroll wheel, and click relationship lines to view foreign key details. Result: the team can intuitively understand table relationships.

## Done when

- Foreign key configuration panel lists all target foreign keys, with correct fields, related tables, and related fields.
- DDL on the right already contains `FOREIGN KEY` statements.
- ER diagram correctly shows relationship lines between current table and associated tables.
- Update/delete rules match business expectations.

## Common pitfalls

- When foreign key field and related field types are incompatible, generated DDL may fail on the target database. Confirm type matching in advance.
- If the related table does not exist in the current workspace, the ER diagram may only show the node without its field details.
- Leaving foreign key name empty causes auto-generation by the system; if you have special naming conventions, manual entry is recommended.
- Not all databases support all cascade rules (e.g., SET NULL requires the field to be nullable). Confirm target database support before selecting.
