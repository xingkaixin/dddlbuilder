---
description: "Model a MySQL users-and-orders foreign key in DDLBuilder, inspect its ER diagram and generated SQL, and distinguish physical constraints from logical relationships."
---

# Foreign Key Configuration and ER Diagram

[Open DDLBuilder to model relationships](https://ddl.xingkaixin.me/). If you already have CREATE TABLE statements, [import your SQL](/en/advanced/import-and-parse) first. After modeling, continue with [ORM model generation](/en/advanced/orm-generation).

This guide explains how to design relational constraints and visualize schema architecture using DDLBuilder's **Foreign Key Configuration Panel** and **Interactive ER Diagram Canvas**.

## Example: a many-to-one relationship between orders and users

This example uses a **physical MySQL foreign key**. A user can have many orders, and every order must reference a user. Both reference columns use signed `INT`.

### Prepare two tables

Copy this SQL, open [DDLBuilder](https://ddl.xingkaixin.me/), select MySQL, and use **Import SQL**. Make sure both tables are saved to the workspace. See [SQL import and parsing](/en/advanced/import-and-parse) for the full steps.

```sql
CREATE TABLE users (
  id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  PRIMARY KEY (id ASC)
);

CREATE TABLE orders (
  id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (id ASC)
);
```

### Create the relationship and check the ER diagram

1. Open **ER Diagram** and drag from `orders.user_id` to `users.id`.
2. Select a physical foreign key, **Many-to-One (N:1)**, and **Required**. Set the delete action to `RESTRICT` and the update action to `CASCADE`.
3. Set the relationship name to `fk_orders_user` and leave automatic query index creation unchecked. Create the relationship and save `orders`.

The arrow points from the foreign key column to the referenced primary key:

```text
orders.user_id (N) ───→ users.id (1)
```

The ER diagram should show a solid physical foreign key line. `users.id` is a primary key. `orders.user_id` is `NOT NULL` without a unique constraint, so several orders can reference the same user.

### Check the generated SQL

Select `orders`. Its DDL should contain the following, with formatting depending on your settings:

```sql
CREATE TABLE orders (
  id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (id ASC)
);

ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE;
```

When executing the SQL, create `users` first, then run the table and foreign key statements for `orders`. `RESTRICT` prevents deleting a user referenced by an order. `CASCADE` updates the order references when the user's primary key changes. Use a MySQL storage engine that supports foreign keys, such as InnoDB.

If you only need to document a business association, select a logical relationship instead. It will not generate the `ALTER TABLE` foreign key statement above. Continue with [ORM model generation](/en/advanced/orm-generation) to see how a table maps to code.

## Logical relationships without physical foreign keys

Systems without physical foreign keys can document business associations. Save both tables to the workspace first.

1. Drag from a source field handle to a target field handle in the ER diagram.
2. Select **Logical relationship** in the wizard, confirm the fields, cardinality and optionality, and enter a business description.
3. Select **Create relationship**. The target field does not need a primary or unique key.

Logical relationships use dashed lines with cardinality and optionality labels. Hover over the label for the business description. The foreign key panel also identifies logical relationships. Delete a relationship from the diagram or panel; rename it in the panel.

These relationships document intent without creating constraints or indexes or changing nullability. DDL, ORM, ALTER and rollback output exclude them. They persist with tables, version history, shares and workspace sync. Physical foreign key uniqueness and cascade restrictions below do not apply to logical relationships.

## Overview

Establish referential integrity across domain entities (e.g., users, orders, departments, products), define cascading rules, and inspect the overall relational topology in an interactive canvas.

---

## Operations Walkthrough

### 1. Visual Relationship Wizard via ER Diagram (Recommended)
1. Ensure both source and target tables are saved to the workspace.
2. Click **ER Diagram** in the table header to open the interactive canvas.
3. **Connect Nodes**: Drag the connection handle from the source column to the target column.
4. **Configure in the Relationship Wizard**:
   - **Column Verification**: Confirms source and target column references (target columns must be single-column primary or unique keys).
   - **Select Cardinality**: Choose **Many-to-One (N:1)** or **One-to-One (1:1)**. One-to-One automatically enforces a unique constraint on the source column.
   - **Select Optionality**: Choose **Required** (sets source column to `NOT NULL`) or **Optional** (sets source column to `NULL`).
   - **Cascade Actions & Indexes**: Define `ON DELETE` and `ON UPDATE` actions (`NO ACTION`, `CASCADE`, `SET NULL`, etc.), and optionally create a secondary index on the foreign key column.
5. Click **Create Relationship** to apply foreign key constraints, nullability adjustments, and supporting indexes atomically.

### 2. Manual Configuration via Foreign Key Panel
1. Switch to the **Foreign Keys** tab in the configuration area.
2. Click **Add Foreign Key** to insert a new row.
3. Specify the **Constraint Name**, select the local column, target table, and target column.
4. Configure **ON UPDATE** and **ON DELETE** cascade rules.
5. The DDL panel updates immediately with `CONSTRAINT ... FOREIGN KEY ... REFERENCES ...` clauses.

### 3. Canvas Navigation and Organization
- **Drag & Auto-Layout**: Drag table cards freely or use the toolbar's auto-layout button to organize complex graphs.
- **Zoom & Pan**: Use the mouse wheel to zoom and drag to pan across large workspaces.
- **Inspect / Delete Relations**: Click on edge badges to view cascade rules, or click the delete button on an edge to remove the foreign key constraint.

---

## Verification Checklist

- [ ] Foreign keys appear in both the configuration table and the ER diagram.
- [ ] Valid foreign key constraint DDL renders in the output editor.
- [ ] 1:1 relations enforce unique constraints; high-frequency join columns have supporting indexes.

## Tips and Common Traps

::: warning Type Compatibility and Reference Rules
Target columns **must be single-column primary keys or unique index columns**. Furthermore, data types and sign attributes (e.g., `UNSIGNED`) must match exactly between both sides.
:::

- **SET NULL Nullability**: If `ON DELETE SET NULL` is chosen, the source column cannot be marked as `NOT NULL`.
- **Exact Node Binding**: The ER canvas links tables by unique internal IDs rather than ambiguous name matching.
