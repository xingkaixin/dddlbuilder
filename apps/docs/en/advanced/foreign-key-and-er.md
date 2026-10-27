---
title: "SQL to ER diagram: MySQL foreign key guide"
description: "Import MySQL CREATE TABLE SQL and model users and orders in an ER diagram. Follow a complete example and compare physical foreign keys, logical relationships and cascade rules."
---

# SQL to ER diagram: MySQL foreign key guide

[Open DDLBuilder to model relationships](https://ddl.xingkaixin.me/). If you already have CREATE TABLE statements, [import your SQL](/en/advanced/import-and-parse) first. After modeling, continue with [ORM model generation](/en/advanced/orm-generation).

This guide explains how to create table relationships and set foreign key constraints with DDLBuilder's foreign key panel and ER diagram.

## Example: a many-to-one relationship between orders and users

This example uses a **physical MySQL foreign key**. A user can have many orders, and every order must reference a user. Both reference columns use signed `INT`.

### Prepare two tables

Copy this SQL, open [DDLBuilder](https://ddl.xingkaixin.me/), select MySQL, and use **Import Schema**. Make sure both tables are saved to the workspace. See [SQL import and parsing](/en/advanced/import-and-parse) for the full steps.

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

1. In the table config area, click **More**, open **ER Diagram**, and drag from `orders.user_id` to `users.id`.
2. Select **Physical foreign key**, **Many to one** and **Required**. Set the delete action to `RESTRICT` and the update action to `CASCADE`.
3. Set **Foreign key name** to `fk_orders_user` and leave **Create an index for the foreign key** unchecked. Click **Create Relationship** and save `orders`.

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
3. Click **Create Relationship**. The target field does not need a primary or unique key.

Logical relationships use dashed lines with cardinality and optionality labels. Hover over the label for the business description. The foreign key panel also identifies logical relationships. Delete a relationship from the diagram or panel; rename it in the panel.

These relationships document intent without creating constraints or indexes or changing nullability. DDL, ORM, ALTER and rollback output exclude them. They persist with tables, version history, shares and workspace sync. Physical foreign key uniqueness and cascade restrictions below do not apply to logical relationships.

## When to use

Use this to create references between business tables (such as users and orders, or departments and employees), set cascade rules for updates and deletes, and view the relationships of all workspace tables in the ER diagram.

---

## Steps

### 1. Create a relationship in the ER diagram (recommended)
1. Make sure the source and target tables are saved to the current workspace.
2. In the table config area, click **More** and select **ER Diagram**.
3. Drag the handle on the left of the source field to the handle on the right of the target field.
4. Set the following in the **Create Table Relationship** dialog:
   - Check the source and target fields the dialog fills in. The target field must be a single-field primary or unique key.
   - Under **Cardinality**, choose **Many to one** or **One to one**. For one to one, the dialog adds a unique index on the source field.
   - Under **Relationship requirement**, choose **Required** (sets the source field to `NOT NULL`) or **Optional** (sets it to `NULL`).
   - Choose the actions for **When referenced record is deleted** and **When referenced key is updated** (`NO ACTION`, `CASCADE`, `SET NULL` and others), and decide whether to check **Create an index for the foreign key**.
5. Click **Create Relationship**. DDLBuilder writes the foreign key constraint, field nullability and index to the source table together, and the ER diagram draws the new line.

### 2. Create a foreign key in the foreign key panel
1. Switch to the **Foreign Keys** tab.
2. Click **Add Foreign Key**.
3. Enter **Constraint Name** and **Target Table**, select **Local Fields**, then type each of the **Target Fields** and press Enter to add it.
4. Set **On Delete** and **On Update** as needed.
5. Click **Add**. The DDL in the generated output now includes a `CONSTRAINT ... FOREIGN KEY ... REFERENCES ...` statement.

### 3. Browse and arrange the ER diagram
- Drag table nodes to move them, or click **Auto Layout** in the toolbar.
- Use the mouse wheel to zoom, and drag the canvas to pan.
- The label on a physical foreign key line shows its delete and update actions. Hover over it to see the foreign key name. Click the delete button next to the label to remove the foreign key constraint.

---

## Verification checklist

- [ ] The new relationship appears in both the foreign key list and the ER diagram.
- [ ] The DDL in the generated output contains the foreign key constraint statement.
- [ ] One-to-one source fields have a unique index, and foreign key fields often used in joins have a regular index.

## Notes

::: warning Type compatibility and reference rules
The target field must be a single-column primary key or unique index column. The source and target fields must have the same data type and sign (`UNSIGNED`), or the database returns an error when you run the statement.
:::

- If the delete action is `SET NULL`, the source field must allow `NULL` and cannot be `NOT NULL`.
- The ER diagram finds the referenced table by schema name and table name. If the workspace has more than one table with that name, the diagram does not draw the line.
