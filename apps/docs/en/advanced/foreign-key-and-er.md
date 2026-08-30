# Foreign Key Configuration and ER Diagram

This guide explains how to design relational constraints and visualize schema architecture using DDLBuilder's **Foreign Key Configuration Panel** and **Interactive ER Diagram Canvas**.

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
