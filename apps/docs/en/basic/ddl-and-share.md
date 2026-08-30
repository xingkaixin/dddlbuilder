# DDL Output and Sharing

This guide details how to review and export table DDL, DCL privilege scripts, ORM model classes, and routine skeletons, as well as how to collaborate securely via read-only share links.

## Overview

After completing your schema model, export the generated artifacts to database review systems, deploy them via change tickets, embed ORM models in application repositories, or share links for team alignment.

---

## Operations Walkthrough

### 1. Review and Switch Multi-Target Artifacts
The right-hand output panel lets you toggle between specialized views:
- **Table DDL**: Review the complete `CREATE TABLE` script, primary key, column constraints, comments, indexes, and partitioning clauses. If a `Schema Name` is present, the table identifier renders as `schema.table`.
- **Privilege DCL**: Inspect generated `GRANT` permission statements for configured roles.
- **ORM Models**: Switch seamlessly between **Prisma, TypeORM, SQLAlchemy, GORM, and JPA** to generate typed models with appropriate annotations.
- **View/Routine**: Inspect generated `CREATE VIEW` definitions and skeleton code for stored procedures, functions, and triggers.

### 2. Copying and Output Formatting
- Click **Copy DDL**, **Copy DCL**, **Copy ORM**, or **Copy View/Routine** to instantly copy code to your clipboard.
- Use the toolbar toggle to switch between **Compact** and **Aligned** SQL formatting modes. Copied output reflects your chosen preview format.

### 3. Collapsible Output Panel for Wide Tables
When editing tables with many columns, click the **Collapse icon** at the top of the output panel to hide it and maximize horizontal editing space. Click the expand handle to restore it at any time.

### 4. Generating Read-Only Share Links
1. Click the **Share Link** button in the top navigation bar.
2. DDLBuilder generates a time-limited **read-only URL** and copies it to your clipboard.
3. The shared snapshot encapsulates the table name, schema name, column definitions, constraints, indexes, and miscellaneous settings.

### 5. Collaboration and Forking Copies
- Collaborators accessing the share link view a **strictly read-only protected page** that prevents accidental changes to your original design.
- To iterate on the shared schema, recipients can click **Save as Copy and Start Editing** in the top banner, which loads an independent editable replica into their workspace.

---

## Dialect Version & Syntax Specifics

::: info Database Dialect Details
- **Oracle Synonyms**: Generated DDL no longer automatically includes `PUBLIC SYNONYM`. If required, manage synonyms separately with appropriate DBA privileges.
- **MySQL Complex Defaults**: Constant default values for TEXT, BLOB, or JSON types use parenthesized expression syntax (e.g., `DEFAULT ('{}')`), requiring MySQL 8.0.13 or newer.
- **Escaping Behavior**: MySQL string literals assume standard backslash escaping. Verify syntax if your database session enforces `NO_BACKSLASH_ESCAPES`.
:::

---

## Verification Checklist

- [ ] Copied SQL executes successfully in target database management tools.
- [ ] Qualified schema prefixes appear accurately across all relevant outputs.
- [ ] Share links open as read-only snapshots in incognito browser windows.
- [ ] Clicking "Save as Copy" successfully initializes an editable workspace tab.
